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

    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const date = req.query.date;

      const options = await appointmentOptionCollection.find(query).toArray();
      const bookingQuery = { appointmentDate: date };

      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();

      // console.log(alreadyBooked);

      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.slot);

        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        
        option.slots = remainingSlots
        
        console.log(date, option.name, bookedSlots, remainingSlots);
      });
      res.send(options);
    });

    // for booking ?

    app.post("/bookings", async (req, res) => {
      const bookings = req.body;
      const result = await bookingCollection.insertOne(bookings);
      res.send(result);
    });

    app.get("/bookings");
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`doctors portal running on ${port}`);
});
