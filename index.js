const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

require("dotenv").config();
// for stripe key ///

const stripe = require("stripe")(process.env.STRIPE_SECRET);

const port = process.env.PORT || 3003;

// middle ware ///

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("doctor portal is running ");
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ysfeeva.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// for verify JWT ///
function verifyJWT(req, res, next) {
  // console.log("token", req.headers.authorization);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("Unauthorized 401 from verifyJWT func");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentOptionCollection = client
      .db("doctors-portal")
      .collection("appointment-options");

    const bookingCollection = client
      .db("doctors-portal")
      .collection("bookings");

    const usersCollection = client.db("doctors-portal").collection("users");

    const doctorsCollection = client.db("doctors-portal").collection("doctors");

    const paymentsCollection = client
      .db("doctors-portal")
      .collection("payments");

    // verify Admin ///

    //NOTE :  make sure  You use verifyAdmin after verify JWT

    const verifyAdmin = async (req, res, next) => {
      console.log("inside verifyAdmin ", req.decoded.email);

      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user.role !== "admin") {
        res.status(403).send({ message: "Forbidden Access from user admin" });
      }
      next();
    };

    // for payment stripe //
    app.post("/create-payment-intend", async (req, res) => {
      const booking = req.body;

      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // for toke JWT ///

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      // console.log(user);

      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "2d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    /***
     * API Naming Convention
     * app.get('/bookings')
     * app.get('/bookings/:id')
     * app.post('/bookings')
     * app.patch('/bookings/:id')
     * app.delete('/bookings/:id')
     */

    //   use Aggregate to query multiple collection and then merge data /

    // for booking ?

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      //   console.log(bookings);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };

      const alreadyBooked = await bookingCollection.find(query).toArray();

      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }

      const result = await bookingCollection.insertOne(booking);

      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const bookings = await bookingCollection.findOne(query);
      res.send(bookings);
    });

    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const date = req.query.date;

      const options = await appointmentOptionCollection.find(query).toArray();

      //   get the booking by the provided date ///
      const bookingQuery = { appointmentDate: date }; //query by date from client site fetch ///

      const alreadyBooked = await bookingCollection.find(bookingQuery).toArray(); //////appointment date wise booking

        // console.log('already booked',alreadyBooked);-

      ///get appointment option by some citeria ////
      options.forEach((option) => {
        ////get every option ///

        // console.log('foreach option',option);
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        ); ////get booking by option name equality //

        // console.log('Option Booked',optionBooked);

        const bookedSlots = optionBooked.map((book) => book.slot); //get slot from booked option //

        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        ); /////   get slots of option which are not selected or matched     //////

        option.slots = remainingSlots;

        // console.log(date, option.name, bookedSlots, remainingSlots.length);
      });

      res.send(options);
    });

    // Optional ///

    // Advance for Backend ////

    app.get("/v2/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const options = await appointmentOptionCollection
        .aggregate([
          {
            $lookup: {
              from: "bookings",
              localField: "name",
              foreignField: "treatment",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointmentDate", date],
                    },
                  },
                },
              ],
              as: "booked",
            },
          },
          {
            $project: {
              name: 1,
              slots: 1,
              price: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.slot",
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              price: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
      res.send(options);
    });
    // cl;ose advance

    app.get("/appointmentSpeciality", async (req, res) => {
      const query = {};
      const result = await appointmentOptionCollection
        .find(query)
        .project({ name: 1 })
        .toArray();

      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      console.log(decodedEmail);

      const query = { email: email };

      const bookings = await bookingCollection.find(query).toArray();

      res.send(bookings);
    });

    // post user //
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await usersCollection.insertOne(user);

      res.send(result);
    });

    // admin user///

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };

      const user = await usersCollection.findOne(query);

      res.send({ isAdmin: user?.role === "admin" });
    });

    // get user
    app.get("/users", async (req, res) => {
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user.role !== "admin") {
        res.status(403).send({ message: "Forbidden Access from user admin" });
      }

      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };

      const updateDocument = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDocument,
        options
      );
      res.send(result);
    });

    // for doctor add  ///

    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      // console.log(doctor);
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });

    app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await doctorsCollection.deleteOne(filter);

      res.send(result);
    });

    // temoporary data for post price one time ... ///

    // app.get('/addPrice',async(req,res)=>{
    //   const filter = {}
    //   const options={upsert:true}
    //   const updateDoc ={
    //     $set:{
    //       price:99,
    //     }
    //   }
    //   const result = await appointmentOptionCollection.updateMany(filter,updateDoc,options)
    //   res.send(result)
    // })

    app.post("/payment", async (req, res) => {
      const payment = req.body;

      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };

      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`doctors portal running on ${port}`);
});
