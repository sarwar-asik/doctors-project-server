const express = require("express");
const cors = require("cors");

const app = express();

require("dotenv").config();

const port = process.env.PORT || 3003;

// middle ware ///

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("doctor portal is running ");
});

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ysfeeva.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const appointmentOptionCollection = client
      .db("doctors-portal")
      .collection("appointment-options");

    const bookingCollection = client
      .db("doctors-portal")
      .collection("bookings");

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

    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const date = req.query.date;

      const options = await appointmentOptionCollection.find(query).toArray();

      //   get the booking by the provided date ///

      const bookingQuery = { appointmentDate: date }; //query by date from client site fetch ///

      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray(); //////appointment date wise booking

      //   console.log('already booked',alreadyBooked);

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
      const date = req.query.data;
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

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;

      const query = { email: email };

      const bookings = await bookingCollection.find(query).toArray();

      res.send(bookings);
    });
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`doctors portal running on ${port}`);
});
