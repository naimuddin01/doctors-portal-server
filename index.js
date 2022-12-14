//heroku hosse deploy kora, amra jokhon ekt url use kori tokhon seta ke soba jaygai use korar jonno deploy kora hoy
//hosting ta holo clint side ke sobar kase pathanor jonno


const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);//for payment

const app = express()
const port = process.env.PORT || 5000

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j5ivzwd.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {

  const authHeader = req.headers.authorization;
  console.log('authorization', authHeader);

  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' })
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    console.log('decoded', decoded);
    req.decoded = decoded;
    next();
  })
}

async function run() {

  try {
    await client.connect();
    console.log('Database conncet')
    const servicesCollection = client.db('doctors-portal').collection('services');
    const bookingCollection = client.db('doctors-portal').collection('bookings');
    const userCollection = client.db('doctors-portal').collection('users');
    const doctorCollection = client.db('doctors-portal').collection('doctors');
    const paymentCollection = client.db('doctors-portal').collection('payments');


    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'Forbidden access' });
      }
    }

    //user for payment intention 
    app.post('/create-payment-intent',verifyJWT, async (req, res) => {
      const service = req.body
      const price = service.price;
      const amount = price*100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency : 'usd',
        payment_method_types: ['card']

      });
      res.send({clientSecret: paymentIntent.client_secret});
    })
    //user for payment intention 

    app.get('/service', async (req, res) => {
      const query = {}
      // const cursor = servicesCollection.find(query); //eikhane database thake sob nisce

      //(project({name: 1}))dara bojay amra jothy database thake ekta object ke nite chi ba baad dite chi tahole project use korbi
      //{name: 1} name hosse object er naam database e jeta deyo ase r 1 holo jothy nite chi r 0 dile seta bade sob dibe
      const cursor = servicesCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    app.get('/user', verifyJWT, async (req, res) => {
      //ekhane amra cursor query diayo korte partam, kintu amra ekhane ekbare korce
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    })


    //admin er url
    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email; // eikhane sudu user email ta nisce params er maddome

      //verifyAdmin() midleware toyri korar age
      // const requester = req.decoded.email;
      // const requesterAccount = await userCollection.findOne({ email: requester });
      // if (requesterAccount.role === 'admin') {
      //   const filter = { email: email } //client pathano email collection e ase kina seta check korbe

      //   const updateDoc = {
      //     $set: { role: 'admin' },
      //   }

      //   const result = await userCollection.updateOne(filter, updateDoc);

      //   res.send(result);
      // }

      // else{
      //   res.status(403).send({message: 'forbidden'});
      // }
      //verifyAdmin() midleware toyri korar age



      //verifyAdmin() midleware toyri korar por
      const filter = { email: email }
      const updateDoc = {
        $set: { role: 'admin' },
      }
      const result = await userCollection.updateOne(filter, updateDoc);

      res.send(result);
      //verifyAdmin() midleware toyri korar por

    })

    //admin




    //eikhane kaj kortece
    //jothy notun user hoy tahole userCollection e save korbo r purono user hole save korbo na
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email; // eikhane sudu user email ta nisce params er maddome
      const user = req.body // eikhane user er onno data gulo nisce
      const filter = { email: email } //client pathano email collection e ase kina seta check korbe
      //upsert ta holo colections er vitore je value ta insert korbo seta ager thake ase kina == mane data duplicate hosse kina seta check korbe...duplicate hole r colection e data ta save hobe na
      const options = { upsert: true };

      const updateDoc = {
        $set: user,
      }
      const result = await userCollection.updateOne(filter, updateDoc, options);
      // res.send(result);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

      console.log(token)
      res.send({ result, token }); //send jothy 2ta kora hoy tahole {} = er vitore hobe
    })

    //This is not the proper way to query (but we can do this way)
    //After learning more about mongodb. use aggregate lookup, pipeline, match, group
    app.get('/available', async (req, res) => {
      const date = req.query.date;

      //step 1: get all services

      const services = await servicesCollection.find().toArray();

      //setp 2: get the booking of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      //step 3: (forEach) holo for loop er moto for each service, find bookings for that service
      services.forEach(service => {
        //setp 4: find bookings for that service
        //booking collection er treatment Object er value && service collection er name Object er value milasce 
        const serviceBookings = bookings.filter(book => book.treatment === service.name);
        //step 5: select slots for the service bookings
        // mongods er booking collection e joto gulo collection thakbe potita collection er slot gulo nisce 
        const bookedSlots = serviceBookings.map(book => book.slot);


        //////booked r uporer bookedSlots er kaj eki 2 jaygai
        //booked kaj ki kore korbe seta dekhar jonno (url er maddome result dekha jabe)
        // const booked = serviceBookings.map(b => b.slot);
        // service.booked = booked; 
        //(service.booked) mongodb te service callection potita collection er jonno  booked naam er object create kortese 
        //booked object er vitore user jothy kno treatment er slot e click kore tahole oy treatment naam er collection er vitore booked object er vitore sei slot maan bose jabe
        // service.booked = serviceBookings.map(s => s.slot);
        //booked kaj ki kore korbe seta dekhar jonno


        //step 6: select those slots that are not in booked
        //available = mongo te service collection er vitore slots naam er array er element er sathe, amra je notun kore upore bookedSlots naam er array banayce tar elements er sathe compair kore uncommon gulo available er vitore bosasce
        const available = service.slots.filter(slot => !bookedSlots.includes(slot));

        //mongo db te notun kore available naam er array toyri kore seikhane available er naam bosaye disi
        //available dile client site e Appointment er vitore server component er vitore slots er jaygai available dite hobe
        // service.available = available; 

        //step 7: set available to slots to make it easier
        // ager je slots array ase seita ke replace kore available er naam bosasce
        service.slots = available;

      })


      // res.send(services);
      res.send(services);

    })


    /**  
     * API Naming Convention
     * app.get('/booking') //get all bookings in this collection or get more than one or by filter
     * app.get('/booking/:id') //get a specific booking
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id') //patch a specific booking update
     * app.put('/booking/:id') //upsert ==> update (if exists data) or insert (if doesnot exist)
     * app.delete('/booking/:id') //patch a specific booking delete
     */

    //ei booking e ekta user er sob gulo data dekhasce dashbod er maddome
    app.get('/booking', verifyJWT, async (req, res) => {
      //mgdb te data er modde patient er value holo email ta tai client site thake patient ta pele or sob data payo jabe
      const patient = req.query.patient
      const decodedEmail = req.decoded.email
      if (patient === decodedEmail) {
        console.log(patient)
        const query = { paitent: patient }; //prothom paitent ta holo mgdb er object er naam porer ta client site thake je patient er value asse seta
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'Forbidden access' });
      }


    })

    app.get('/booking/:id', verifyJWT, async(req, res) => {
      const id = req.params.id;
      const query ={_id: ObjectId(id)}
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    })

    //Mongo te Booking er information pathanor jonno
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
      //user eki time e eki treatment ba ek dine ekta treatment 2bar  disse kina seta check kortece
      //query er vitor jothy (treatment: booking.treatment,) treatment ta na thakto tahole ekdin e ektai treatment e booking kora jayto
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        //return deyor karon jothy exist kore tahole if er niche r jabe na eitake e return kore dibe
        //(success: false) hosse url e ekta Object pathasce jar value hobe false
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking); //obossoy await korte hobe
      return res.send({ success: true, result }); //(return) word ta dile o hoy na dile o hoy
    })

    app.patch('/booking/:id', verifyJWT, async (req, res) => {
      const id =req.params.id;
      const payment = req.body
      const filter = {_id: ObjectId(id)};
      
      //maybe
      //importent
      //updateDoc holo amra jothy database thake kono data pathate ba (ante parbo kina sure na) chi and sei jonno jothy kno sotto thake tahole updateDov use kori
      const updatedDoc = {
        $set:{
          //paid jothy true hoy tahole taransactionId ta database e pathabo
          paid: true,
          transactionId: payment.transactionId,

        }
      }

      //paymentCollection e notun kore data bosasce
      const result = await paymentCollection.insertOne(payment)

      //bookingCollection e data update kortece
      const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
      res.send(updatedDoc);
    })

    app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = await doctorCollection.find().toArray();
      res.send(doctor);
    })

    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = {email: email};
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })

  }
  finally {

  }

}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello From Doctor Uncle!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})