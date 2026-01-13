import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const profileSchema = new Schema(
    {
        firstName: { type: String, default: "" },
        lastName: { type: String, default: "" },
        otherNames: { type: String },
        country: { type: String },
        countryCode: { type: String },
        gender: { type: String },
        dateOfBirth: { type: String },
        phone: { type: String },
        altPhone: { type: String },
        email: { type: String, unique: true, required: true },
        city: { type: String },
        address: { type: String },
        zip: { type: String },
        imageUrl: { type: String },
        otherImages: [{ type: String }],
        type: { type: String },
        maritalStatus: { type: String },
        marriageAnniversary: { type: String },
        nextOfKin: { type: String, default: "" },
        nextOfKinContact: { type: String, default: "" },
        // KYC Fields
        kycStatus: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'unverified'],
            default: 'unverified'
        },
        kycLevel: { type: Number, default: 0 },
        kycDocuments: [{
            type: { type: String }, // 'national_id', 'passport', etc.
            url: { type: String },
            status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
            uploadedAt: { type: Date, default: Date.now }
        }],
        kycRejectionReason: { type: String }
    },
    {
        collection: "demo_profiles",
        versionKey: false,
    }
);

profileSchema.plugin(mongoosePaginate);

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
