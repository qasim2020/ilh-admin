const User = require('../models/User');
const Program = require('../models/Program');
const Activity = require('../models/Activity');
const Log = require('../models/Logs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

const { isValidEmail } = require('../modules/checkValidForm');

exports.toggleSideBar = async (req, res) => {
    req.session.sidebarCollapsed = req.body.sidebarCollapsed;

    res.json({
        message: 'Sidebar toggled',
        sidebar: req.body.sidebarCollapsed,
    });
};

exports.getDashboard = async (req, res) => {
    try {
        const [
            programCount,
            activeProgramCount,
            activityCount,
            activeActivityCount,
            userCount,
            recentPrograms,
            recentLogs,
        ] = await Promise.all([
            Program.countDocuments(),
            Program.countDocuments({ isActive: true }),
            Log.countDocuments(),
            Log.countDocuments(),
            User.countDocuments(),
            Program.find().sort({ createdAt: -1 }).limit(5).lean(),
            Log.find().sort({ createdAt: -1 }).limit(8).populate('user', 'name email').lean(),
        ]);

        res.render('home', {
            activeMenu: 'dashboard',
            stats: {
                programCount,
                activeProgramCount,
                activityCount,
                activeActivityCount,
                userCount,
            },
            recentPrograms,
            recentLogs,
            userId: req.session.userId,
            userName: req.session.name,
            sidebarCollapsed: req.session.sidebarCollapsed ? req.session.sidebarCollapsed : false,
        });
    } catch (error) {
        console.log(error);
        res.status(404).render('error', {
            layout: 'auth',
            heading: 'Server error',
            error,
        });
    }
};