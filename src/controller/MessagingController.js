import Message from '../models/Message.js';
import Sms from '../../utils/bulksmsng/Sms.js';
import { readFileSync } from 'fs';
import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import sendEmail from '../../utils/emails/emails.js';

const newMessage = async (req, res) => {
    const { from, recipients, body, type = "sms", subject = "Notification Email" } = req.body;

    if (!(from && recipients && body)) {
        return res.status(400).send("Sender, recipients and message body are required.");
    }

    try {
        if (type === "sms") {
            const smsInstance = Sms();
            const sentMessage = await smsInstance.sendSMS(from, recipients, body);

            if (sentMessage?.status) {
                const message = await Message.create({
                    type,
                    from,
                    recipients,
                    body,
                    status: sentMessage?.status
                });

                if (message) {
                    return res.status(201).json('Message created successfully');
                } else {
                    return res.status(400).json('Error in creating message');
                }
            } else {
                return res.status(400).json("Error in sending message");
            }
        } else if (type === "email") {
            const source = readFileSync("./storage/emails/normalEmail.mjml", "utf8");
            const htmlOutput = mjml2html(source);
            const template = Handlebars.compile(htmlOutput.html);
            const templateData = { content: body };

            console.log({ recipients });
            recipients?.forEach(recipient => {
                sendEmail(
                    recipient,
                    "",
                    "City Crown Hotels",
                    "City Crown Hotels <noreply@citycrownhotels.ng>",
                    subject,
                    "",
                    template(templateData)
                );
            });

            return res.status(200).json("Email(s) sent successfully");
        }
    } catch (e) {
        console.log({ e });
        return res.status(500).json(`Error: ${e?.toString()}`);
    }
};

const editMessage = async (req, res) => {
    try {
        const { name, payload } = req.body;
        const message = await Message.findOneAndUpdate({ name }, payload, { new: true });

        if (!message) {
            return res.status(404).send('Message not found');
        }

        res.send({
            status: "success",
            message: 'Message edited successfully',
            data: message
        });
    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: err?.toString()
        });
    }
};

const allMessages = async (req, res) => {
    try {
        const page = req.params?.page;
        const perPage = req.params?.perPage;
        const q = req.query?.q;

        const options = {
            page,
            limit: perPage,
            sort: { createdAt: -1 }
        };

        const query = { message: q };

        if (q && q.length) {
            const Messages = await Message.paginate(query, options);

            if (Messages) {
                return res.send({
                    status: "success",
                    data: Messages
                });
            } else {
                return res.send({
                    status: "error",
                    message: "Fetching Messages with query failed"
                });
            }
        } else {
            const Messages = await Message.paginate({}, options);

            if (Messages) {
                return res.send({
                    status: "success",
                    data: Messages
                });
            } else {
                return res.send({
                    status: 'error',
                    message: 'Fetching Messages failed'
                });
            }
        }
    } catch (e) {
        return res.send({
            status: 'error',
            message: e.toString()
        });
    }
};

const selectMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const message = await Message.find({ _id: id });

        if (!message) {
            return res.send({
                status: 'error',
                data: 'No message with that id'
            });
        }

        res.status(200).send({
            status: 'success',
            data: message
        });
    } catch (err) {
        console.log(err);
        return res.status(500).send({
            status: 'error',
            error: err
        });
    }
};

export default {
    newMessage,
    editMessage,
    allMessages,
    selectMessage
};
