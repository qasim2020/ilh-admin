const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema({
    imageUrl: String,
    heroImagePositionX: {
        type: Number,
        default: 50,
        min: 0,
        max: 100,
    },
    heroImagePositionY: {
        type: Number,
        default: 50,
        min: 0,
        max: 100,
    },
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
            originalUrl: String,
            originalFilename: String,
            thumbnailUrl: String,
            thumbnailFilename: String,
            status: {
                type: String,
                enum: ["ready", "processing", "failed"],
                default: "ready",
            },
            processingError: String,
            order: {
                type: Number,
                default: 0,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        },
    ],
    isActive: {
        type: Boolean,
        default: true
    },
    ticketingEnabled: {
        type: Boolean,
        default: false,
    },
    ticketPrice: {
        type: Number,
        default: null,
        min: 0,
    },
    ticketCurrency: {
        type: String,
        default: "NOK",
        trim: true,
    },
    seatCapacity: {
        type: Number,
        default: null,
        min: 1,
    },
    seatsSold: {
        type: Number,
        default: 0,
        min: 0,
    },
}, { timestamps: true });


module.exports = mongoose.model('Program', ProgramSchema);
