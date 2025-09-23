// src/controller/ChatController.js
import Chat from '../models/Chat.js';

function ChatController() {
    const getConversationHistory = async (req, res) => {
        try {
            const { conversationId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 30;

            if (!conversationId) {
                return res.status(400).json({ message: 'Conversation ID is required.' });
            }

            const options = {
                page,
                limit,
                sort: { createdAt: -1 }, // Sort by most recent messages first
                populate: { path: 'senderId', select: 'firstName lastName type' }
            };

            const history = await Chat.paginate({ conversationId }, options);

            res.status(200).json({
                status: 'success',
                message: 'Chat history retrieved successfully.',
                data: history,
            });
        } catch (err) {
            console.error('Get chat history error:', err);
            res.status(500).json({ message: 'An error occurred while retrieving chat history.' });
        }
    };

    return {
        getConversationHistory,
    };
}

export default ChatController;