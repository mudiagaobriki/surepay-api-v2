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
    },
    {
        collection: "demo_profiles",
        versionKey: false,
    }
);

profileSchema.plugin(mongoosePaginate);

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;
