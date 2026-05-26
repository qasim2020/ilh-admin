const fs = require('fs');
const path = require('path');

const User = require('../models/User');
const Program = require('../models/Program');
const { createLog } = require('../modules/logService');
const { enqueueGalleryMediaProcessing, enqueueProcessingGalleryItems } = require('../modules/galleryProcessor');
const { hasHeifSignature, isHeicImageFile } = require('../modules/videoConverter');

function parseOptionalPositiveNumber(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function parseTicketSettings(payload) {
    const ticketingEnabled = String(payload.ticketingEnabled || '').toLowerCase() === 'true';
    const ticketPriceRaw = String(payload.ticketPrice || '').trim();
    const ticketPriceParsed = ticketPriceRaw ? Number(ticketPriceRaw) : null;
    const ticketPrice = Number.isFinite(ticketPriceParsed) && ticketPriceParsed > 0 ? ticketPriceParsed : null;
    const ticketCurrency = String(payload.ticketCurrency || 'NOK').trim().toUpperCase() || 'NOK';
    const seatCapacity = parseOptionalPositiveNumber(payload.seatCapacity);

    return {
        ticketingEnabled,
        ticketPrice,
        ticketCurrency,
        seatCapacity,
    };
}

function normalizeCurrency(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return 'NOK';
    return raw.replace(/[^A-Z]/g, '').slice(0, 8) || 'NOK';
}

function parseImagePosition(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(100, Math.max(0, Math.round(parsed)));
}

function sortGalleryItems(gallery) {
    return (gallery || []).slice().sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) return orderA - orderB;

        const timeA = new Date(a.uploadedAt || 0).getTime();
        const timeB = new Date(b.uploadedAt || 0).getTime();
        return timeA - timeB;
    });
}

exports.programs = async (req, res) => {

    const rawPrograms = await Program.find().sort({ createdAt: -1 }).lean();
    const programs = rawPrograms.map((program) => {
        const gallery = sortGalleryItems(program.gallery);
        const galleryPreview = gallery
            .filter((item) => Boolean(item?.thumbnailUrl || item?.url))
            .slice(0, 3)
            .map((item) => ({
                url: item.thumbnailUrl || item.url,
            }));

        return {
            ...program,
            galleryCount: gallery.length,
            galleryPreview,
            galleryRemainingCount: Math.max(gallery.length - galleryPreview.length, 0),
        };
    });

    res.render('programs', {
        programs,
        activeMenu: 'programs',
        userId: req.session.userId,
        userName: req.session.name,
        sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
    });
};

exports.programView = async (req, res) => {
    try {
        const { id } = req.params;
        const program = await Program.findById(id).lean();

        if (!program) {
            return res.status(404).render('error', {
                message: 'Program not found',
                activeMenu: 'programs',
                userId: req.session.userId,
                userName: req.session.name,
                sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
            });
        }

        program.gallery = sortGalleryItems(program.gallery);
        program.heroImagePositionX = parseImagePosition(program.heroImagePositionX);
        program.heroImagePositionY = parseImagePosition(program.heroImagePositionY);
        enqueueProcessingGalleryItems(program);

        return res.render('program-view', {
            program,
            activeMenu: 'programs',
            userId: req.session.userId,
            userName: req.session.name,
            sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
        });
    } catch (error) {
        console.error('Error loading program view:', error);
        return res.status(500).render('error', {
            message: 'Failed to load program',
            activeMenu: 'programs',
            userId: req.session.userId,
            userName: req.session.name,
            sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
        });
    }
};

exports.createProgram = async (req, res) => {
    try {
        const { imageUrl, heroImagePositionX, heroImagePositionY, title, age, ageRange, duration, description, specialFeatures, gender, status } = req.body;

        const isActive = status === 'active';
        const program = new Program({
            imageUrl,
            heroImagePositionX: parseImagePosition(heroImagePositionX),
            heroImagePositionY: parseImagePosition(heroImagePositionY),
            title,
            ageRange: ageRange || age,
            duration,
            description,
            specialFeatures,
            gender,
            isActive,
            ticketingEnabled: false,
            ticketPrice: null,
            ticketCurrency: 'NOK',
            seatCapacity: null,
            seatsSold: 0,
        });
        await program.save();
        createLog({
            req,
            action: 'create',
            entityType: 'program',
            entityId: program._id,
            message: `Program ${program.title} created by ${req.session?.name || 'system'}`,
            metadata: { title: program.title, createdBy: req.session?.name || 'system' },
        });
        res.status(201).json({ message: 'Program created successfully' });
    } catch (error) {
        console.error('Error creating program:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.editProgramModal = async (req, res) => {
    try {
        const { id } = req.params;
        const program = await Program.findOne({
            _id: id,
        }).sort({ createdAt: -1 }).lean();
        program.heroImagePositionX = parseImagePosition(program.heroImagePositionX);
        program.heroImagePositionY = parseImagePosition(program.heroImagePositionY);

        res.render('partials/editProgramModal', {
            layout: false,
            program,
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error fetching program details',
            details: error.message,
        });
    }
};

exports.updateProgram = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            imageUrl,
            heroImagePositionX,
            heroImagePositionY,
            title,
            age,
            ageRange,
            duration,
            description,
            specialFeatures,
            gender,
            status,
        } = req.body;

        const isActive = status === 'active';

        const updated = await Program.findByIdAndUpdate(
            id,
            {
                imageUrl,
                heroImagePositionX: parseImagePosition(heroImagePositionX),
                heroImagePositionY: parseImagePosition(heroImagePositionY),
                title,
                ageRange: ageRange || age,
                duration,
                description,
                specialFeatures,
                gender,
                isActive,
            },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ error: 'Program not found' });
        }

        createLog({
            req,
            action: 'update',
            entityType: 'program',
            entityId: updated._id,
            message: `Program ${updated.title} updated by ${req.session?.name || 'system'}`,
            metadata: { title: updated.title, updatedBy: req.session?.name || 'system' },
        });

        return res.json({ message: 'Program updated successfully' });
    } catch (error) {
        console.error('Error updating program:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateProgramTicketing = async (req, res) => {
    try {
        const { id } = req.params;
        const ticketSettings = parseTicketSettings(req.body);
        const ticketCurrency = normalizeCurrency(req.body.ticketCurrency);

        if (ticketSettings.ticketingEnabled && !ticketSettings.ticketPrice) {
            return res.status(400).json({ error: 'Ticket price must be greater than 0 when ticketing is enabled' });
        }

        const existingProgram = await Program.findById(id).select('seatsSold').lean();
        if (!existingProgram) {
            return res.status(404).json({ error: 'Program not found' });
        }

        if (ticketSettings.seatCapacity !== null && Number(existingProgram.seatsSold || 0) > ticketSettings.seatCapacity) {
            return res.status(400).json({ error: 'Seat capacity cannot be lower than seats already sold' });
        }

        const updated = await Program.findByIdAndUpdate(
            id,
            {
                ticketingEnabled: ticketSettings.ticketingEnabled,
                ticketPrice: ticketSettings.ticketPrice,
                ticketCurrency,
                seatCapacity: ticketSettings.seatCapacity,
            },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ error: 'Program not found' });
        }

        createLog({
            req,
            action: 'update',
            entityType: 'program-ticketing',
            entityId: updated._id,
            message: `Program ticketing updated by ${req.session?.name || 'system'}`,
            metadata: {
                title: updated.title,
                ticketingEnabled: updated.ticketingEnabled,
                ticketPrice: updated.ticketPrice,
                ticketCurrency: updated.ticketCurrency,
                seatCapacity: updated.seatCapacity,
            },
        });

        return res.json({ message: 'Ticketing settings updated successfully' });
    } catch (error) {
        console.error('Error updating program ticketing:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteProgram = async (req, res) => {
    try {
        const { id } = req.params;

        const program = await Program.findById(id).lean();
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        if (program.imageUrl && typeof program.imageUrl === 'string') {
            const normalizedImageUrl = program.imageUrl.replace(/^\//, '');
            const imagePath = path.join(__dirname, '..', normalizedImageUrl);

            fs.unlink(imagePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error('Failed to delete program image:', err);
                }
            });
        }

        if (Array.isArray(program.gallery)) {
            program.gallery.forEach((item) => {
                deleteGalleryFiles(item);
            });
        }

        await Program.deleteOne({ _id: id });
        createLog({
            req,
            action: 'delete',
            entityType: 'program',
            entityId: id,
            message: `Program ${program.title} deleted by ${req.session?.name || 'system'}`,
            metadata: { title: program.title, deletedBy: req.session?.name || 'system' },
        });
        return res.json({ message: 'Program deleted successfully' });
    } catch (error) {
        console.error('Error deleting program:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.addProgramGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const requestId = req.galleryUploadRequestId || 'unknown';
        const startedAt = req.galleryUploadStartedAt || Date.now();
        const elapsedMs = Date.now() - startedAt;
        const files = Array.isArray(req.files) ? req.files : [];

        console.log('[gallery-upload-debug]', new Date().toISOString(), 'controller-enter', {
            requestId,
            programId: id,
            elapsedMs,
            fileCount: files.length,
            files: files.map((file) => ({
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                filename: file.filename,
                path: file.path,
            })),
        });

        if (!req.files || req.files.length === 0) {
            console.log('[gallery-upload-debug]', new Date().toISOString(), 'controller-no-files', {
                requestId,
                programId: id,
                elapsedMs: Date.now() - startedAt,
            });
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const program = await Program.findById(id);
        if (!program) {
            console.log('[gallery-upload-debug]', new Date().toISOString(), 'controller-program-not-found', {
                requestId,
                programId: id,
            });
            return res.status(404).json({ error: 'Program not found' });
        }

        const currentMaxOrder = (program.gallery || []).reduce((max, item) => {
            const value = typeof item.order === 'number' ? item.order : -1;
            return Math.max(max, value);
        }, -1);

        const startIndex = program.gallery.length;
        const mediaItems = [];
        for (let index = 0; index < req.files.length; index += 1) {
            const file = req.files[index];
            const isVideo = file.mimetype && file.mimetype.startsWith('video/');
            const isHeicImage = isHeicImageFile(file) || await hasHeifSignature(file.path);
            const nextOrder = currentMaxOrder + 1 + index;
            const needsProcessing = isVideo || isHeicImage;

            mediaItems.push({
                url: needsProcessing ? null : `/uploads/${file.filename}`,
                type: isVideo ? 'video' : 'image',
                filename: needsProcessing ? null : file.filename,
                originalUrl: needsProcessing ? `/uploads/${file.filename}` : null,
                originalFilename: needsProcessing ? file.filename : null,
                thumbnailUrl: null,
                thumbnailFilename: null,
                status: needsProcessing ? 'processing' : 'ready',
                uploadedAt: new Date(),
                order: nextOrder,
            });
        }

        program.gallery.push(...mediaItems);
        await program.save();

        const addedItems = program.gallery.slice(startIndex).map((item) => item.toObject());

        addedItems.forEach((item, index) => {
            if (item.status !== 'processing') {
                return;
            }

            const file = req.files[index];
            enqueueGalleryMediaProcessing({
                programId: program._id,
                itemId: item._id,
                file: {
                    path: file.path,
                    destination: file.destination,
                    filename: file.filename,
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                },
                mediaType: item.type === 'video' ? 'video' : 'image',
            });
        });

        createLog({
            req,
            action: 'upload',
            entityType: 'program-gallery',
            entityId: id,
            message: `${mediaItems.length} media item(s) uploaded by ${req.session?.name || 'system'}`,
            metadata: { count: mediaItems.length, uploadedBy: req.session?.name || 'system' },
        });

        console.log('[gallery-upload-debug]', new Date().toISOString(), 'controller-success', {
            requestId,
            programId: id,
            elapsedMs: Date.now() - startedAt,
            savedCount: addedItems.length,
            processingCount: addedItems.filter((item) => item.status === 'processing').length,
        });

        return res.json({ media: addedItems });
    } catch (error) {
        console.log('[gallery-upload-debug]', new Date().toISOString(), 'controller-error', {
            requestId: req.galleryUploadRequestId || 'unknown',
            programId: req.params?.id || null,
            message: error?.message || null,
            stack: error?.stack || null,
        });
        console.error('Error adding program gallery:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.programGalleryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const ids = String(req.query.ids || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

        const program = await Program.findById(id).lean();
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        enqueueProcessingGalleryItems(program);

        const media = Array.isArray(program.gallery)
            ? sortGalleryItems(program.gallery).filter((item) => ids.length === 0 || ids.includes(String(item._id)))
            : [];

        return res.json({ media });
    } catch (error) {
        console.error('Error loading program gallery status:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.reorderProgramGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const list = req.body.itemIds || req.body['itemIds[]'];
        const itemIds = Array.isArray(list)
            ? list.map((value) => String(value))
            : typeof list === 'string'
                ? [String(list)]
                : [];

        if (itemIds.length === 0) {
            return res.status(400).json({ error: 'itemIds is required' });
        }

        const program = await Program.findById(id);
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const orderMap = new Map(itemIds.map((itemId, index) => [itemId, index]));

        program.gallery.forEach((item) => {
            const itemId = String(item._id);
            if (orderMap.has(itemId)) {
                item.order = orderMap.get(itemId);
            }
        });

        await program.save();

        createLog({
            req,
            action: 'update',
            entityType: 'program-gallery',
            entityId: id,
            message: `Gallery reordered by ${req.session?.name || 'system'}`,
            metadata: { count: itemIds.length, updatedBy: req.session?.name || 'system' },
        });

        return res.json({ message: 'Gallery reordered successfully' });
    } catch (error) {
        console.error('Error reordering program gallery:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteProgramGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const { itemId, filename, url } = req.body;

        if (!itemId && !filename && !url) {
            return res.status(400).json({ error: 'Gallery item id, filename, or URL is required' });
        }

        const program = await Program.findById(id);
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const target = program.gallery.find((item) => {
            if (itemId) return String(item._id) === String(itemId);
            if (filename) return item.filename === filename;
            return item.url === url;
        });

        if (!target) {
            return res.status(404).json({ error: 'Media not found' });
        }

        program.gallery = program.gallery.filter((item) => {
            if (itemId) return String(item._id) !== String(itemId);
            if (filename) return item.filename !== filename;
            return item.url !== url;
        });

        await program.save();

        deleteGalleryFiles(target);

        createLog({
            req,
            action: 'delete',
            entityType: 'program-gallery',
            entityId: id,
            message: `Gallery item removed by ${req.session?.name || 'system'}`,
            metadata: { filename: target.filename || null, url: target.url || null },
        });

        return res.json({ message: 'Media removed successfully' });
    } catch (error) {
        console.error('Error deleting program gallery:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

function deleteGalleryFiles(item) {
    ['url', 'originalUrl', 'thumbnailUrl'].forEach((field) => {
        const value = item[field];
        if (!value || typeof value !== 'string' || !value.startsWith('/uploads/')) {
            return;
        }

        const normalized = value.replace(/^\//, '');
        const filePath = path.join(__dirname, '..', normalized);
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error(`Failed to delete gallery ${field}:`, err);
            }
        });
    });
}
