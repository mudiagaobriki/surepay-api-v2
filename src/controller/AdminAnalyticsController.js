import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import BillPayment from '../models/BillPayment.js';
import { subDays, startOfDay, endOfDay } from 'date-fns';

// Mock data for analytics
const getOverview = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ isDeleted: false });

        // Active users (active in last 30 days)
        const thirtyDaysAgo = subDays(new Date(), 30);
        const activeUsers = await User.countDocuments({
            isDeleted: false,
            lastActiveAt: { $gte: thirtyDaysAgo }
        });

        const totalTransactions = await Transaction.countDocuments({});
        const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });

        // Aggregate volume and profit
        const txStats = await Transaction.aggregate([
            { $match: { status: 'completed' } },
            {
                $group: {
                    _id: null,
                    totalVolume: { $sum: '$amount' },
                    totalProfit: { $sum: '$fee' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const stats = txStats[0] || { totalVolume: 0, totalProfit: 0, count: 0 };

        res.status(200).json({
            status: 'success',
            data: {
                totalUsers,
                activeUsers,
                totalTransactions,
                totalVolume: stats.totalVolume,
                totalProfit: stats.totalProfit,
                totalTxCount: stats.count,
                pendingTransactions
            }
        });
    } catch (error) {
        console.error('Overview Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getUserGrowth = async (req, res) => {
    try {
        // Last 30 days
        const thirtyDaysAgo = subDays(new Date(), 30);

        const growth = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: thirtyDaysAgo },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({
            status: 'success',
            data: growth
        });
    } catch (error) {
        console.error('User Growth Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getChartData = async (req, res) => {
    try {
        // Last 7 days transaction volume
        const sevenDaysAgo = subDays(new Date(), 7);

        const chartData = await Transaction.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    amount: { $sum: '$amount' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.status(200).json({
            status: 'success',
            data: chartData
        });
    } catch (error) {
        console.error('Chart Data Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getStatusDistribution = async (req, res) => {
    try {
        const distribution = await Transaction.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            status: 'success',
            data: distribution
        });
    } catch (error) {
        console.error('Status Distribution Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

const getServiceUsage = async (req, res) => {
    try {
        const usage = await BillPayment.aggregate([
            {
                $match: { status: 'completed' }
            },
            {
                $group: {
                    _id: '$serviceType',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } },
            { $limit: 5 }
        ]);

        res.status(200).json({
            status: 'success',
            data: usage
        });
    } catch (error) {
        console.error('Service Usage Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

export default {
    getOverview,
    getUserGrowth,
    getChartData,
    getStatusDistribution,
    getServiceUsage
};
