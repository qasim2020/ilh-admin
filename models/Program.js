const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema({
    imageUrl: String,
    title: String,
    gender: {
        type: String,
        enum: ["boys", "girls", "both"],
    },
    description: String,
    specialFeatures: String,
    ageRange: String,
    duration: String,
    gallery: [
        {
            url: String,
            type: {
                type: String,
                enum: ["image", "video"],
                default: "image",
            },
            filename: String,
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });


module.exports = mongoose.model('Program', ProgramSchema);
