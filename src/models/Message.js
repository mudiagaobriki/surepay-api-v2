import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const messageSchema = new Schema({
  type: { type: String },
  from: { type: String },
  recipients: [{ type: String }],
  body: { type: String },
  status: { type: String },
  sent: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
}, {
  collection: 'demo_messages',
  versionKey: false,
});

messageSchema.plugin(mongoosePaginate);

const Message = mongoose.model("Message", messageSchema);

export default Message;
