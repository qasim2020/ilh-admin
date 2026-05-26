const multer = require("multer");
const fs = require("fs");
const path = require("path");

const express = require('express');
const router = express.Router();
const requireLogin = require('../modules/authenticate');
const programController = require('../controllers/programController');
const { createLog } = require('../modules/logService');
const { convertImageToJpeg } = require('../modules/videoConverter');
const uploadDebugPrefix = '[gallery-upload-debug]';

// Set up storage
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, "uploads/"); 
    },
    filename: function(req, file, cb) {
        const originalName = file.originalname;
        const ext = path.extname(originalName).toLowerCase();
        const baseName = path.basename(originalName, ext);
        const safeName = baseName
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "image";

        cb(null, `${safeName}-${Date.now()}${ext}`);
    }
});
const maxGalleryFileSizeMb = Number(process.env.MAX_GALLERY_FILE_SIZE_MB || 1024);
const upload = multer({
    storage,
    limits: {
        fileSize: maxGalleryFileSizeMb * 1024 * 1024,
    },
});

function handleMulterError(err, res) {
    if (!err) return false;
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: `File is too large. Maximum allowed size is ${maxGalleryFileSizeMb}MB.`,
        });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
}

function logGalleryUploadDebug(message, meta = {}) {
    console.log(`${uploadDebugPrefix} ${new Date().toISOString()} ${message}`, meta);
}

router.post("/upload-program-image", (req, res) => {
    upload.single("programImage")(req, res, async (err) => {
        if (handleMulterError(err, res)) return;
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        let uploadedFile = req.file;
        try {
            uploadedFile = await convertImageToJpeg(req.file);
        } catch (error) {
            console.error('Program image conversion failed:', error);
            return res.status(500).json({ error: 'Failed to process image' });
        }
        createLog({
            req,
            action: 'upload',
            entityType: 'program-image',
            message: `Program image uploaded by ${req.session?.name || 'system'}`,
            metadata: { filename: uploadedFile.filename, uploadedBy: req.session?.name || 'system' },
        });
        return res.json({ imageUrl: `/uploads/${uploadedFile.filename}` });
    });
});

router.post("/delete-program-image", (req, res) => {
    const imageUrl = req.body.imageUrl; 
    if (!imageUrl) return res.status(400).send("No image URL provided");

    const filePath = path.join(__dirname, "..", imageUrl);
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Failed to delete file");
        }
        res.send({ message: "Deleted successfully" });
    });
});

router.get("/programs", requireLogin, programController.programs);
router.get("/programs/:id/view", requireLogin, programController.programView);
router.post("/programs", requireLogin, programController.createProgram);
router.post("/programs/:id", requireLogin, programController.updateProgram);
router.post("/programs/:id/ticketing", requireLogin, programController.updateProgramTicketing);
router.post("/programs/:id/gallery", requireLogin, (req, res, next) => {
    const requestId = req.globalGalleryDebugRequestId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    req.galleryUploadRequestId = requestId;
    req.galleryUploadStartedAt = Date.now();
    logGalleryUploadDebug('request-received', {
        requestId,
        programId: req.params.id,
        userId: req.session?.userId || null,
        contentLength: req.headers['content-length'] || null,
        contentType: req.headers['content-type'] || null,
        cfRay: req.headers['cf-ray'] || null,
        cfIpCountry: req.headers['cf-ipcountry'] || null,
    });

    upload.array("galleryFiles", 100)(req, res, (err) => {
        const elapsedMs = Date.now() - req.galleryUploadStartedAt;
        if (err) {
            logGalleryUploadDebug('multer-error', {
                requestId,
                elapsedMs,
                code: err.code || null,
                name: err.name || null,
                message: err.message || null,
            });
        } else {
            const files = Array.isArray(req.files) ? req.files : [];
            logGalleryUploadDebug('multer-success', {
                requestId,
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
        }
        if (handleMulterError(err, res)) return;
        return next();
    });
}, programController.addProgramGallery);
router.get("/programs/:id/gallery/status", requireLogin, programController.programGalleryStatus);
router.post("/programs/:id/gallery/reorder", requireLogin, programController.reorderProgramGallery);
router.post("/programs/:id/gallery/delete", requireLogin, programController.deleteProgramGallery);
router.get("/getEditProgramModal/:id", requireLogin, programController.editProgramModal);
// router.get("/programs/new", requireLogin, programController.newProgramForm);
// router.get("/programs/:id/edit", requireLogin, programController.editProgramForm);
// router.post("/programs/:id/edit", requireLogin, programController.updateProgram);
router.post("/programs/:id/delete", requireLogin, programController.deleteProgram);

module.exports = router;
