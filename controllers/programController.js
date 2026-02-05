const fs = require('fs');
const path = require('path');

const User = require('../models/User');
const Program = require('../models/Program');

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

exports.createProgram = async (req, res) => {
    try {
        const { imageUrl, title, age, duration, description, specialFeatures, gender, status } = req.body;
        const program = new Program({
            imageUrl,
            title,
            ageRange: age,
            duration,
            description,
            specialFeatures,
            gender,
            status
        });
        await program.save();
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

        await Program.deleteOne({ _id: id });
        return res.json({ message: 'Program deleted successfully' });
    } catch (error) {
        console.error('Error deleting program:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};