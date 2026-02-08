const fs = require('fs');
const path = require('path');

const User = require('../models/User');
const Program = require('../models/Program');
const { createLog } = require('../modules/logService');

exports.programs = async (req, res) => {

    const programs = await Program.find().sort({ createdAt: -1 }).lean();

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
        const { imageUrl, title, age, ageRange, duration, description, specialFeatures, gender, status } = req.body;
        const isActive = status === 'active';
        const program = new Program({
            imageUrl,
            title,
            ageRange: ageRange || age,
            duration,
            description,
            specialFeatures,
            gender,
            isActive
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
                if (item.url && typeof item.url === 'string' && item.url.startsWith('/uploads/')) {
                    const normalizedUrl = item.url.replace(/^\//, '');
                    const filePath = path.join(__dirname, '..', normalizedUrl);
                    fs.unlink(filePath, (err) => {
                        if (err && err.code !== 'ENOENT') {
                            console.error('Failed to delete gallery file:', err);
                        }
                    });
                }
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

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const program = await Program.findById(id).lean();
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const mediaItems = req.files.map((file) => ({
            url: `/uploads/${file.filename}`,
            type: file.mimetype && file.mimetype.startsWith('video/') ? 'video' : 'image',
            filename: file.filename,
            uploadedAt: new Date(),
        }));

        await Program.findByIdAndUpdate(id, {
            $push: { gallery: { $each: mediaItems } },
        });

        createLog({
            req,
            action: 'upload',
            entityType: 'program-gallery',
            entityId: id,
            message: `${mediaItems.length} media item(s) uploaded by ${req.session?.name || 'system'}`,
            metadata: { count: mediaItems.length, uploadedBy: req.session?.name || 'system' },
        });

        return res.json({ media: mediaItems });
    } catch (error) {
        console.error('Error adding program gallery:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.deleteProgramGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const { filename, url } = req.body;

        if (!filename && !url) {
            return res.status(400).json({ error: 'Filename or URL is required' });
        }

        const program = await Program.findById(id);
        if (!program) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const target = program.gallery.find((item) => {
            if (filename) return item.filename === filename;
            return item.url === url;
        });

        if (!target) {
            return res.status(404).json({ error: 'Media not found' });
        }

        program.gallery = program.gallery.filter((item) => {
            if (filename) return item.filename !== filename;
            return item.url !== url;
        });

        await program.save();

        if (target.url && target.url.startsWith('/uploads/')) {
            const normalized = target.url.replace(/^\//, '');
            const filePath = path.join(__dirname, '..', normalized);
            fs.unlink(filePath, (err) => {
                if (err && err.code !== 'ENOENT') {
                    console.error('Failed to delete gallery file:', err);
                }
            });
        }

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