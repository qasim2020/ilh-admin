const path = require('path');
const fs = require('fs/promises');
const Program = require('../models/Program');
const { convertVideoToMp4, convertImageToJpeg, isHeicImageFile } = require('./videoConverter');

const queuedItems = new Set();
const queue = [];
let activeJobs = 0;
const maxConcurrentJobs = 1;

function itemKey(programId, itemId) {
    return `${programId}:${itemId}`;
}

function publicUploadPath(filename) {
    return `/uploads/${filename}`;
}

function enqueueGalleryMediaProcessing({ programId, itemId, file, mediaType }) {
    const key = itemKey(programId, itemId);

    if (queuedItems.has(key)) {
        return;
    }

    queuedItems.add(key);
    queue.push({ programId, itemId, file, mediaType, key });
    processQueue();
}

function processQueue() {
    while (activeJobs < maxConcurrentJobs && queue.length > 0) {
        const job = queue.shift();
        activeJobs += 1;

        processGalleryMedia(job)
            .catch((error) => {
                console.error('Gallery video processing failed:', error);
            })
            .finally(() => {
                activeJobs -= 1;
                queuedItems.delete(job.key);
                processQueue();
            });
    }
}

async function processGalleryMedia({ programId, itemId, file, mediaType }) {
    try {
        const isVideo = mediaType === 'video';
        const converted = isVideo
            ? await convertVideoToMp4(file)
            : await convertImageToJpeg(file);

        const updateResult = await Program.updateOne(
            { _id: programId, 'gallery._id': itemId },
            {
                $set: {
                    'gallery.$.url': publicUploadPath(converted.filename),
                    'gallery.$.filename': converted.filename,
                    'gallery.$.thumbnailUrl': isVideo ? publicUploadPath(converted.thumbnailFilename) : null,
                    'gallery.$.thumbnailFilename': isVideo ? converted.thumbnailFilename : null,
                    'gallery.$.status': 'ready',
                    'gallery.$.processingError': null,
                    'gallery.$.originalUrl': null,
                    'gallery.$.originalFilename': null,
                },
            }
        );

        if (updateResult.matchedCount === 0) {
            const cleanupFiles = [converted.path];
            if (converted.thumbnailPath) {
                cleanupFiles.push(converted.thumbnailPath);
            }

            await Promise.allSettled([
                ...cleanupFiles.map((filePath) => fs.unlink(filePath)),
            ]);
        }
    } catch (error) {
        await Program.updateOne(
            { _id: programId, 'gallery._id': itemId },
            {
                $set: {
                    'gallery.$.status': 'failed',
                    'gallery.$.processingError': error.message || 'Video processing failed',
                },
            }
        );
        throw error;
    }
}

function enqueueProcessingGalleryItems(program) {
    if (!program || !Array.isArray(program.gallery)) {
        return;
    }

    program.gallery.forEach((item) => {
        if (item.status !== 'processing' || !item.originalUrl || !item._id) {
            return;
        }

        const filename = item.originalFilename || path.basename(item.originalUrl);
        const file = {
            path: path.join(__dirname, '..', item.originalUrl.replace(/^\//, '')),
            destination: path.join(__dirname, '..', 'uploads'),
            filename,
            originalname: filename,
            mimetype: item.type === 'video' ? 'video/unknown' : 'image/unknown',
        };

        if (item.type === 'image' && !isHeicImageFile(file)) {
            return;
        }

        enqueueGalleryMediaProcessing({
            programId: program._id,
            itemId: item._id,
            file,
            mediaType: item.type === 'video' ? 'video' : 'image',
        });
    });
}

module.exports = {
    enqueueGalleryMediaProcessing,
    enqueueProcessingGalleryItems,
};
