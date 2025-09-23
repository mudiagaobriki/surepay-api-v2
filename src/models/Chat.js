// src/models/Chat.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const chatSchema = new Schema(
    {
        conversationId: {
            type: String,
            required: true,
            index: true,
        },
        senderId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // receiverId could be a user or a support agent
        receiverId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        read: {
            type: Boolean,
            default: false,
        },
        // The TTL index will automatically delete documents after 30 days (2592000 seconds)
        createdAt: {
            type: Date,
            default: Date.now,
            expires: '30d',
        },
    },
    {
        collection: "chats",
        versionKey: false,
        timestamps: true,
    }
);

chatSchema.plugin(mongoosePaginate);

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;