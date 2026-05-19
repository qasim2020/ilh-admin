const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const Settings = require('../models/Settings');

const { isValidEmail, isStrongPassword } = require('../modules/checkValidForm');
const { verifyPassword, hashPassword } = require('../modules/password');
const { createLog } = require('../modules/logService');

exports.renderLoginPage = async (req, res) => {
    try {
        res.render('login', { layout: 'auth' });
    } catch (error) {
        res.status(500).json({
            error: 'An error occurred while rendering login page',
            details: error.message,
        });
    }
};

function generateResetToken(email, passwordHash) {
    return jwt.sign({ email, purpose: 'password-reset', passwordHash }, process.env.JWT_SECRET, { expiresIn: '60m' });
}

async function sendResetPasswordEmail(name, email, resetLink) {
    const settings = await Settings.findOne({ key: 'main' }).lean();

    if (!settings || !settings.emailHost || !settings.emailPort || !settings.emailUser || !settings.emailPass) {
        throw new Error('Email settings are not configured. Please update settings first.');
    }

    const port = Number(settings.emailPort);
    const useSecure = port === 465 ? true : Boolean(settings.emailSecure);

    const transporter = nodemailer.createTransport({
        host: settings.emailHost,
        port,
        secure: useSecure,
        requireTLS: !useSecure,
        ignoreTLS: false,
        tls: {
            rejectUnauthorized: false,
        },
        auth: {
            user: settings.emailUser,
            pass: settings.emailPass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
    });

    const templatePath = path.join(__dirname, '../views/emails/resetPassword.hbs');
    const templateSource = await fs.readFile(templatePath, 'utf8');
    const compiledTemplate = handlebars.compile(templateSource);

    const html = compiledTemplate({
        name,
        resetLink,
    });

    await transporter.sendMail({
        from: `"${settings.emailFromName || 'iLearningHubb'}" <${settings.emailFromAddress || settings.emailUser}>`,
        to: email,
        subject: 'Reset your dashboard password',
        html,
    });
}

exports.login = async (req, res) => {
    try {
        const { email: emailProvided, password } = req.body;
        const email = (emailProvided || '').toLowerCase().trim();

        if (!email || !password) {
            return res.status(400).render('login', {
                layout: 'auth',
                note: 'Email and password are required.',
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).render('login', {
                layout: 'auth',
                note: 'Please enter a valid email address.',
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).render('login', {
                layout: 'auth',
                note: 'Invalid email or password.',
            });
        }

        if (!user.isActive) {
            return res.status(403).render('login', {
                layout: 'auth',
                note: 'Your account is inactive. Please contact an administrator.',
            });
        }

        const isPasswordValid = verifyPassword(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).render('login', {
                layout: 'auth',
                note: 'Invalid email or password.',
            });
        }

        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.name = user.name;

        req.session.save(() => {
            createLog({
                req,
                userId: user._id,
                action: 'login',
                entityType: 'user',
                entityId: user._id,
                message: 'User logged in',
                metadata: { email: user.email },
            });
            return res.redirect('/dashboard');
        });
    } catch (error) {
        console.log(error);
        return res.status(500).render('login', {
            layout: 'auth',
            note: 'An error occurred while logging in.',
        });
    }
};

exports.renderForgotPasswordPage = async (req, res) => {
    try {
        res.render('forgot-password', { layout: 'auth' });
    } catch (error) {
        res.status(500).json({
            error: 'An error occurred while rendering forgot password page',
            details: error.message,
        });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();

        if (!isValidEmail(email)) {
            return res.status(400).render('forgot-password', {
                layout: 'auth',
                note: 'Please enter a valid email address.',
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render('forgot-password', {
                layout: 'auth',
                success: 'If an account exists for this email, a reset link has been sent.',
            });
        }

        const token = generateResetToken(user.email, user.password || '');
        const baseUrl = req.protocol && req.get ? `${req.protocol}://${req.get('host')}` : process.env.DOMAIN_URL;
        const resetLink = `${baseUrl}/reset-password?token=${token}`;
        await sendResetPasswordEmail(user.name, user.email, resetLink);

        return res.render('forgot-password', {
            layout: 'auth',
            success: 'If an account exists for this email, a reset link has been sent.',
        });
    } catch (error) {
        console.log(error);
        return res.status(500).render('forgot-password', {
            layout: 'auth',
            note: 'An error occurred while sending reset link.',
        });
    }
};

exports.renderResetPasswordPage = async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.render('reset-password', {
                layout: 'auth',
                note: 'Invalid reset link.',
            });
        }

        jwt.verify(token, process.env.JWT_SECRET);
        return res.render('reset-password', { layout: 'auth', token });
    } catch (e) {
        return res.render('reset-password', {
            layout: 'auth',
            note: 'Invalid or expired reset link.',
        });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;
        if (!token) {
            return res.render('reset-password', {
                layout: 'auth',
                note: 'Invalid reset request.',
            });
        }

        if (!password || !confirmPassword) {
            return res.render('reset-password', {
                layout: 'auth',
                token,
                note: 'Password and confirm password are required.',
            });
        }

        if (password !== confirmPassword) {
            return res.render('reset-password', {
                layout: 'auth',
                token,
                note: 'Password and confirm password do not match.',
            });
        }

        if (!isStrongPassword(password)) {
            return res.render('reset-password', {
                layout: 'auth',
                token,
                note: 'Password must be at least 8 characters with upper/lowercase, number, and special character.',
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.purpose !== 'password-reset') {
            return res.render('reset-password', {
                layout: 'auth',
                note: 'Invalid reset link.',
            });
        }

        const user = await User.findOne({ email: decoded.email });
        if (!user) {
            return res.render('reset-password', {
                layout: 'auth',
                note: 'User not found.',
            });
        }

        if ((user.password || '') !== (decoded.passwordHash || '')) {
            return res.render('reset-password', {
                layout: 'auth',
                note: 'Reset link is no longer valid. Please request a new one.',
            });
        }

        user.password = hashPassword(password);
        await user.save();

        createLog({
            req,
            userId: user._id,
            action: 'update',
            entityType: 'user',
            entityId: user._id,
            message: 'User password reset',
            metadata: { email: user.email },
        });

        return res.render('login', {
            layout: 'auth',
            success: 'Password reset successful. Please log in with your new password.',
        });
    } catch (e) {
        return res.render('reset-password', {
            layout: 'auth',
            note: 'Invalid or expired reset link. Please request a new one.',
        });
    }
};

exports.logout = async (req, res) => {
    try {
        req.session.destroy();
        res.redirect('/login');
    } catch (error) {
        res.status(400).send('Error logging out, please try again.');
    }
}
