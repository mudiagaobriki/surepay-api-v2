// import mongoose from 'mongoose';
// import KitchenBarOrder from './../models/KitchenBarOrder'; // Import your Mongoose model
//
// // Create ten documents
// export const CreateDummyOrders = async () => {
//     try {
//         for (let i = 0; i < 10; i++) {
//             const order = new KitchenBarOrder({
//                 customer: {
//                     Id: `customer_id_${i}`,
//                     name: `Customer ${i}`,
//                     contactNumber: `123456789${i}`,
//                     roomNumber: `Room ${i}`,
//                 },
//                 orderDetails: {
//                     totalAmount: Math.floor(Math.random() * 100) + 1,
//                     comments: `Some comments for order ${i}`,
//                 },
//                 orderItems: [
//                     {
//                         Id: mongoose.Types.ObjectId(), // Generate a new ObjectId
//                         quantity: Math.floor(Math.random() * 5) + 1,
//                     },
//                 ],
//             });
//
//             await order.save();
//             console.log('Order saved:', order);
//         }
//     } catch (error) {
//         console.error('Error creating documents:', error);
//     }
// };
