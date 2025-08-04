import http from "http";
import app from "./app.js";
import { randomString } from "./utils/numbers.js";

const server = http.createServer(app);

const { API_PORT } = process.env;
const port = process.env.PORT || API_PORT;

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(randomString(20));
  // console.log("Prototype: ", UsersController.prototype.me(response))
});
