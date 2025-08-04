// const mongoose = require("mongoose");
// const ServiceOrder = require("./../models/serviceOrder"); // Import your Mongoose model
//
// // MongoDB records
// const recordIds = [
//     "65b673a6263deb52305a11d4",
//     "65b67913263deb52305a11d5",
//     "65b67a097cd98f090c087fcd"
// ];
//
// // Create ten documents
// const CreateDummyServiceOrders = async () => {
//     try {
//         for (let i = 0; i < 10; i++) {
//             const order = new ServiceOrder({
//                 customer: {
//                     Id: "customer_id_" + i,
//                     name: "Customer " + i,
//                     contactNumber: "123456789" + i,
//                     roomNumber: "Room " + i,
//                 },
//                 orderDetails: {
//                     totalAmount: Math.floor(Math.random() * 100) + 1,
//                     comments: "Some comments for order " + i,
//                 },
//                 orderItems: [
//                     {
//                         Id: mongoose.Types.ObjectId(recordIds[Math.floor(Math.random() * recordIds.length)]), // Select a random record Id
//                         quantity: Math.floor(Math.random() * 5) + 1,
//                     },
//                 ],
//             });
//
//             await order.save();
//             console.log("Order saved:", order);
//         }
//     } catch (error) {
//         console.error("Error creating documents:", error);
//     }
// };
//
// module.exports = { CreateDummyServiceOrders };
