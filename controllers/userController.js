const User = require('../models/User');
const { createLog } = require('../modules/logService');

exports.users = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).lean();
        res.render('users', {
            users,
            activeMenu: 'users',
            userId: req.session.userId,
            userName: req.session.name,
            sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
        });
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).render('error', {
            message: 'Failed to load users',
            activeMenu: 'users',
            userId: req.session.userId,
            userName: req.session.name,
            sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
        });
    }
};

exports.createUser = async (req, res) => {
    try {
        const { name, email, status } = req.body;
        const isActive = status === 'active';

        const user = new User({
            name,
            email,
            isActive,
        });

        await user.save();
        createLog({
            req,
            action: 'create',
            entityType: 'user',
            entityId: user._id,
            message: `User ${user.name} created by ${req.session?.name || 'system'}`,
            metadata: { email: user.email, name: user.name, createdBy: req.session?.name || 'system' },
        });
        return res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        const isActive = status === 'active';

        const updated = await User.findByIdAndUpdate(
            id,
            {
                name,
                isActive,
            },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ error: 'User not found' });
        }

        createLog({
            req,
            action: 'update',
            entityType: 'user',
            entityId: updated._id,
            message: `User ${updated.name} updated by ${req.session?.name || 'system'}`,
            metadata: { name: updated.name, isActive: updated.isActive, updatedBy: req.session?.name || 'system' },
        });

        return res.json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
