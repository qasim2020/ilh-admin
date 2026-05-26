const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobe = require('ffprobe-static');

function isVideoFile(file) {
    return Boolean(file && file.mimetype && file.mimetype.startsWith('video/'));
}

function isHeicImageFile(file) {
    if (!file) return false;

    const mime = String(file.mimetype || '').toLowerCase();
    const ext = String(path.extname(file.filename || file.originalname || '')).toLowerCase();

    return mime === 'image/heic' || mime === 'image/heif' || ext === '.heic' || ext === '.heif';
}

async function hasHeifSignature(filePath) {
    if (!filePath) return false;

    try {
        const handle = await fs.open(filePath, 'r');
        try {
            const buffer = Buffer.alloc(32);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            const signature = buffer.subarray(0, bytesRead).toString('latin1');
            return /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/i.test(signature);
        } finally {
            await handle.close();
        }
    } catch (_) {
        return false;
    }
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args);
        let stderr = '';

        ffmpeg.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        ffmpeg.on('error', reject);
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        });
    });
}

function runFfprobe(args) {
    return new Promise((resolve, reject) => {
        const ffprobeProcess = spawn(ffprobe.path, args);
        let stdout = '';
        let stderr = '';

        ffprobeProcess.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        ffprobeProcess.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        ffprobeProcess.on('error', reject);
        ffprobeProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        });
    });
}

function parseDuration(value) {
    const duration = Number.parseFloat(value);
    return Number.isFinite(duration) ? duration : 0;
}

async function getBestVideoStreamIndex(filePath) {
    const output = await runFfprobe([
        '-v', 'error',
        '-select_streams', 'v',
        '-show_entries', 'stream=index,duration,nb_frames,width,height',
        '-of', 'json',
        filePath,
    ]);
    const probe = JSON.parse(output);
    const streams = Array.isArray(probe.streams) ? probe.streams : [];

    if (streams.length === 0) {
        throw new Error('No video stream found');
    }

    const bestStream = streams
        .map((stream) => ({
            ...stream,
            durationValue: parseDuration(stream.duration),
            frameCount: Number.parseInt(stream.nb_frames, 10) || 0,
            pixelCount: (Number.parseInt(stream.width, 10) || 0) * (Number.parseInt(stream.height, 10) || 0),
        }))
        .sort((a, b) => (
            b.durationValue - a.durationValue ||
            b.frameCount - a.frameCount ||
            b.pixelCount - a.pixelCount
        ))[0];

    return bestStream.index;
}

async function convertVideoToMp4(file) {
    if (!isVideoFile(file)) {
        return file;
    }

    const inputPath = file.path;
    const originalExt = path.extname(file.filename);
    const baseName = path.basename(file.filename, originalExt);
    const finalFilename = `${baseName}.mp4`;
    const finalPath = path.join(file.destination, finalFilename);
    const thumbnailFilename = `${baseName}-thumbnail.jpg`;
    const thumbnailPath = path.join(file.destination, thumbnailFilename);
    const outputPath = inputPath === finalPath
        ? path.join(file.destination, `${baseName}-converted-${Date.now()}.mp4`)
        : finalPath;

    try {
        const videoStreamIndex = await getBestVideoStreamIndex(inputPath);

        await runFfmpeg([
            '-y',
            '-i', inputPath,
            '-map', `0:${videoStreamIndex}`,
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            '-b:a', '128k',
            outputPath,
        ]);

        await fs.unlink(inputPath);

        if (outputPath !== finalPath) {
            await fs.rename(outputPath, finalPath);
        }

        await createVideoThumbnail(finalPath, thumbnailPath);

        const stats = await fs.stat(finalPath);

        file.filename = finalFilename;
        file.path = finalPath;
        file.mimetype = 'video/mp4';
        file.originalname = `${path.basename(file.originalname, path.extname(file.originalname))}.mp4`;
        file.size = stats.size;
        file.thumbnailFilename = thumbnailFilename;
        file.thumbnailPath = thumbnailPath;

        return file;
    } catch (error) {
        await Promise.allSettled([
            fs.unlink(inputPath),
            fs.unlink(outputPath),
            fs.unlink(thumbnailPath),
        ]);
        throw error;
    }
}

async function convertImageToJpeg(file) {
    const isHeicLike = isHeicImageFile(file) || await hasHeifSignature(file?.path);
    if (!isHeicLike) {
        return file;
    }

    const inputPath = file.path;
    const originalExt = path.extname(file.filename);
    const baseName = path.basename(file.filename, originalExt);
    const finalFilename = `${baseName}.jpg`;
    const finalPath = path.join(file.destination, finalFilename);
    const outputPath = inputPath === finalPath
        ? path.join(file.destination, `${baseName}-converted-${Date.now()}.jpg`)
        : finalPath;

    try {
        try {
            await runFfmpeg([
                '-y',
                '-i', inputPath,
                '-frames:v', '1',
                '-vf', 'zscale=t=linear:npl=100,format=gbrpf32le,tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,eq=gamma=1.08:saturation=1.05,format=yuvj420p',
                '-colorspace', 'bt709',
                '-color_primaries', 'bt709',
                '-color_trc', 'bt709',
                '-q:v', '2',
                outputPath,
            ]);
        } catch (toneMapError) {
            await fs.unlink(outputPath).catch(() => {});
            await runFfmpeg([
                '-y',
                '-i', inputPath,
                '-frames:v', '1',
                '-vf', 'format=yuvj420p',
                '-q:v', '2',
                outputPath,
            ]);
        }

        await fs.unlink(inputPath);

        if (outputPath !== finalPath) {
            await fs.rename(outputPath, finalPath);
        }

        const stats = await fs.stat(finalPath);

        file.filename = finalFilename;
        file.path = finalPath;
        file.mimetype = 'image/jpeg';
        file.originalname = `${path.basename(file.originalname, path.extname(file.originalname))}.jpg`;
        file.size = stats.size;

        return file;
    } catch (error) {
        await Promise.allSettled([
            fs.unlink(inputPath),
            fs.unlink(outputPath),
        ]);
        throw error;
    }
}

async function createVideoThumbnail(videoPath, thumbnailPath) {
    await runFfmpeg([
        '-y',
        '-i', videoPath,
        '-vf', 'thumbnail,scale=640:-2',
        '-frames:v', '1',
        '-q:v', '3',
        thumbnailPath,
    ]);
}

async function ensureVideoThumbnail(videoPath, thumbnailPath) {
    try {
        await fs.access(thumbnailPath);
        return;
    } catch (_) {
        await createVideoThumbnail(videoPath, thumbnailPath);
    }
}

async function cleanUploadedFiles(files) {
    const uploadedFiles = Array.isArray(files) ? files : [files];

    await Promise.allSettled(
        uploadedFiles
            .filter((file) => file && file.path)
            .flatMap((file) => [file.path, file.thumbnailPath].filter(Boolean))
            .map((filePath) => fs.unlink(filePath))
    );
}

async function convertUploadedVideosToMp4(req, res, next) {
    try {
        if (Array.isArray(req.files)) {
            const convertedFiles = [];

            for (const file of req.files) {
                convertedFiles.push(await convertVideoToMp4(file));
            }

            req.files = convertedFiles;
        } else if (req.file) {
            req.file = await convertVideoToMp4(req.file);
        }

        next();
    } catch (error) {
        console.error('Failed to convert uploaded video:', error);
        await cleanUploadedFiles(req.files || req.file);
        res.status(500).json({ error: 'Failed to convert video to MP4' });
    }
}

module.exports = {
    convertVideoToMp4,
    convertImageToJpeg,
    convertUploadedVideosToMp4,
    ensureVideoThumbnail,
    hasHeifSignature,
    isHeicImageFile,
};
