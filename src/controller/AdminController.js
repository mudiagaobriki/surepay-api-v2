import User from "../models/User.js";
import Profile from "../models/Profile.js";

const allUsers = async (req, res) => {
  try {
    const page = req.params?.page;
    const perPage = req.params?.perPage;
    const q = req.query?.q;

    const options = {
      page: page,
      limit: perPage,
      sort: { createdAt: -1 },
    };

    const query = {
      email: q,
      isDeleted: false,
    };

    if (q && q.length) {
      const users = await User.paginate(query, options);

      if (users) {
        return res.send({
          status: "success",
          data: users,
        });
      } else {
        return res.send({
          status: "error",
          message: "Fetching users with query failed",
        });
      }
    } else {
      const users = await User.paginate({ isDeleted: false }, options);

      if (users) {
        for (const user of users?.docs) {
          user.toObject();
          const profile = await Profile.findOne({ email: user.email });
          user.profile = profile;
        }

        return res.send({
          status: "success",
          data: users,
        });
      } else {
        res.send({
          status: "error",
          message: "Fetching users failed",
        });
      }
    }
  } catch (e) {
    return res.send({
      status: "error",
      message: e.toString(),
    });
  }
};

const selectUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with the specified email",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const editUser = async (req, res) => {
  try {
    const { email, payload } = req.body;
    const user = await User.findOneAndUpdate({ email }, payload, { new: true });

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with the specified email",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const selectUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with that id",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.find({ email });

    if (!user) {
      return res.status(404).send({
        status: "error",
        msg: "User not found",
      });
    }

    const deletedUser = await User.findOneAndDelete({ email });

    if (deletedUser) {
      return res.send({
        status: "success",
        msg: "User deleted",
      });
    } else {
      return res.send({
        status: "error",
        msg: "User not deleted successfully",
      });
    }
  } catch (e) {
    return res.send({
      status: "error",
      message: e.toString(),
    });
  }
};

export default {
  allUsers,
  deleteUser,
  selectUserByEmail,
  selectUserById,
  editUser,
};
