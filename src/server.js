const express = require("express");
const path = require("path");
const http = require("http");
const bcrypt = require("bcrypt");
const multer = require("multer");
const hbs = require("hbs");
const session = require("express-session");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const { setIo } = require("./socketService");
setIo(io);

const { Farmer, CollectionAgent, MilkCollection, BaseRate, Counter, Payment, PaymentTransaction, FatRate } = require('./mongodb');

/* Multer Configuration */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../public/uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

/* Middlewares */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* Session Middleware */
app.use(
  session({
    secret: "milk-accounting-secret",
    resave: false,
    saveUninitialized: false
  })
);

/* Authentication Middlewares */
function isAgentLoggedIn(req, res, next) {
  if (!req.session.agent) {
    return res.redirect("/collectionagentlogin");
  }
  next();
}

function isFarmerLoggedIn(req, res, next) {
  if (!req.session.farmer) {
    return res.redirect("/farmerlogin");
  }
  next();
}

// ==========================================
// 🌟 HANDLEBARS HELPERS (వ్యూస్ కంటే ముందే రిజిస్టర్ చేయాలి)
// ==========================================
hbs.registerHelper("ifEquals", function (arg1, arg2, options) {
    return arg1 === arg2 ? options.fn(this) : options.inverse(this);
});

hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

hbs.registerHelper("inc", function (value) {
    return value + 1;
});

hbs.registerHelper("formatDate", function (date) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-IN");
});

// ==========================================
// 🌟 VIEW ENGINE CONFIGURATION (సరిచేయబడింది)
// ==========================================
app.set("view engine", "hbs");

// templates ఫోల్డర్ లొకేషన్‌ను కచ్చితంగా గుర్తించడానికి path.resolve వాడాము
const templatesPath = path.resolve(__dirname, "../templates");
app.set("views", templatesPath);

// ఎక్స్‌ప్రెస్ హ్యాండిల్‌బార్స్ ఇంజన్ మరియు పార్షియల్స్ సెటప్
app.engine("hbs", hbs.__express);
hbs.registerPartials(templatesPath); 

// స్టాటిక్ ఫైల్స్ (CSS/JS) పాత్ సెటప్
app.use(express.static(path.join(__dirname, "../public")));

// ==========================================
// 🚀 మీ రౌట్స్ అన్నీ దీని కింద ప్రారంభమౌతాయి...
// ==========================================

/* ========================================================
   ROUTES SECTION
   ======================================================== */
app.get("/", (req, res) => {
    res.render("home");
});

app.get("/collectionagentlogin", (req, res) => {
  res.render("collectionagentlogin");
});

app.get("/farmerlogin", (req, res) => {
  res.render("farmerlogin");
});

app.get("/collectionagentsignup", (req, res) => {
  res.render("collectionagentsignup");
});

app.get("/farmersignup", (req, res) => {
  res.render("farmersignup");
});

app.get("/farmerforgotpassword", (req, res) => {
  res.render("farmerforgotpassword");
});

app.get("/collectionagentforgotpassword", (req, res) => {
  res.render("collectionagentforgotpassword");
});

/*collection agent profile page get route*/
/* 👤 Collection Agent Profile Route */
app.get("/agent/profile", isAgentLoggedIn, async (req, res) => {
  try {
    const agent = await CollectionAgent
      .findById(req.session.agent)
      .lean();

    if (!agent) {
      return res.redirect("/collectionagentlogin");
    }

    res.render("collectionagentprofile", {
      agent
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Error loading profile page");
  }
});
/* 📊 Collection Agent Dashboard Menu Route (With Live Aggregated Stats) */
app.get("/collectionagentdashboardmenu", isAgentLoggedIn, async (req, res) => {
  try {
    const agentDetails = await CollectionAgent.findById(req.session.agent).lean();
    const totalFarmersCount = await Farmer.countDocuments({});
    // నేటి తేదీ ప్రారంభం మరియు ముగింపు సమయాలను లెక్కించడం (Live Analytics కోసం)//
     const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0); 
     const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    // సెషన్ వైజ్ గణాంకాలు (Morning vs Evening)
    const morningStats =
    await MilkCollection.aggregate([
        {
            $match: {
                session: "Morning"
            }
        },
        {
            $group: {
                _id: null,
                milk: {
                    $sum: "$liters"
                },
                amount: {
                    $sum: "$totalAmount"
                },
                farmersCount: {
                    $addToSet: "$farmerId"
                }
            }
        }
    ]);
    const stats =
    await MilkCollection.aggregate([
        {
            $group: {
                _id: null,
                totalMilk: {
                    $sum: "$liters"
                },
                totalAmount: {
                    $sum: "$totalAmount"
                }
            }
        }
    ]);

const eveningStats =
    await MilkCollection.aggregate([
        {
            $match: {
                session: "Evening"
            }
        }, 
        {
            $group: {
                _id: null,
                milk: {
                    $sum: "$liters"
                },
                amount: {
                    $sum: "$totalAmount"
                },
                farmersCount: {
                    $addToSet: "$farmerId"
                }
            }
        }
    ]);
    // 🌟 సేఫ్ చెకింగ్ (?.) మార్చబడింది - దీనివల్ల డేటా లేకపోయినా సర్వర్ అస్సలు క్రాష్ అవ్వదు
    const dashboardData = {
      totalFarmers: totalFarmersCount,
      agent: agentDetails,
      totalMilk: stats && stats[0] ? stats[0].totalMilk.toFixed(2) : "0.00",
      totalAmount: stats && stats[0] ? stats[0].totalAmount.toFixed(2) : "0.00",
      morningMilk: morningStats && morningStats[0] ? morningStats[0].milk.toFixed(2) : "0.00",
      morningAmount: morningStats && morningStats[0] ? morningStats[0].amount.toFixed(2) : "0.00",
      morningFarmers: morningStats && morningStats[0] ? morningStats[0].farmersCount.length : 0,
      eveningMilk: eveningStats && eveningStats[0] ? eveningStats[0].milk.toFixed(2) : "0.00",
      eveningAmount: eveningStats && eveningStats[0] ? eveningStats[0].amount.toFixed(2) : "0.00",
      eveningFarmers: eveningStats && eveningStats[0] ? eveningStats[0].farmersCount.length : 0
    };

    res.render("collectionagentdashboardmenu", dashboardData);
  } catch (error) {
    console.log(error);
    res.status(500).send("Dashboard Error");
  }
});
/*dashboard stats showing route for selecting date range*/
app.get(
    "/api/dashboard-stats",
    isAgentLoggedIn,
    async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;

            const filter = {};

            if (fromDate && toDate) {
                filter.collectionDate = {
                    $gte: new Date(fromDate),
                    $lte: new Date(
                        toDate + "T23:59:59"
                    )
                };
            }

            const collections =
                await MilkCollection.find(filter);

            let stats = {
                totalMilk: 0,
                totalAmount: 0,
                morningMilk: 0,
                morningAmount: 0,
                morningFarmers: 0,
                eveningMilk: 0,
                eveningAmount: 0,
                eveningFarmers: 0
            };

            const morningSet = new Set();
            const eveningSet = new Set();

            collections.forEach(item => {
                stats.totalMilk +=
                    item.liters || 0;

                stats.totalAmount +=
                    item.totalAmount || 0;

                if (item.session === "Morning") {
                    stats.morningMilk +=
                        item.liters || 0;

                    stats.morningAmount +=
                        item.totalAmount || 0;

                    morningSet.add(
                        item.farmerId.toString()
                    );
                }

                if (item.session === "Evening") {
                    stats.eveningMilk +=
                        item.liters || 0;

                    stats.eveningAmount +=
                        item.totalAmount || 0;

                    eveningSet.add(
                        item.farmerId.toString()
                    );
                }
            });

            stats.morningFarmers =
                morningSet.size;

            stats.eveningFarmers =
                eveningSet.size;

            res.json({
                success: true,
                stats
            });

        } catch (err) {
            console.log(err);

            res.json({
                success: false
            });
        }
    }
);

/* 🚜 Separate Page Route: Farmers Management */
app.get("/agent/farmers", isAgentLoggedIn, async (req, res) => {
  try {
    const farmers = await Farmer.find().sort({ createdAt: -1 });
    res.render("farmer", { farmers });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error fetching farmers");
  }
});
/*fat rate method get route*/
app.get(
    "/agent/fat-rate",
    async (req, res) => {

        try {

            const {
                milkType,
                fat
            } = req.query;

            console.log("Incoming Query:", req.query);

            const fatValue =
                parseFloat(fat);

            console.log("Parsed FAT:", fatValue);

            const fatRate =
                await FatRate.findOne({
                    milkType,
                    fromFat: {
                        $lte: fatValue
                    },
                    toFat: {
                        $gte: fatValue
                    },
                    effectiveFrom: {
                        $lte: new Date()
                    }
                })
                .sort({
                    effectiveFrom: -1
                });

            console.log("Matched Slab:", fatRate);

            res.json({
                success: true,
                rate:
                    fatRate?.rate || 0
            });

        } catch (err) {

            console.log(err);

            res.json({
                success: false,
                rate: 0
            });
        }
    }
);
/* ➕ Save Farmer - Add Farmer Post Route */
app.post("/agent/farmers", isAgentLoggedIn, async (req, res) => {
  try {
    const { farmerId, name, username, password, mobile, village, preferredMilkType } = req.body;

    const existingFarmer = await Farmer.findOne({
      $or: [{ farmerId }, { username }]
    });

    if (existingFarmer) {
      return res.send("Farmer ID or Username already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await Farmer.create({
      farmerId,
      name,
      username,
      password: hashedPassword,
      mobile,
      village,
      preferredMilkType,
      status: "Active"
    });

    res.redirect("/agent/farmers");
  } catch (error) {
    console.log(error);
    res.status(500).send("Unable to Create Farmer");
  }
});

/* ✏️ Get Edit Farmer Form Route */
app.get("/agent/edit-farmer/:id", isAgentLoggedIn, async (req, res) => {
  try {
    const farmer = await Farmer.findById(req.params.id);
    const farmers = await Farmer.find().sort({ createdAt: -1 });
    res.render("farmer", { farmer, farmers });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

/* 🔄 Update Farmer Post Route */
app.post("/agent/update-farmer/:id", isAgentLoggedIn, async (req, res) => {
  try {
    const { farmerId, name, username, password, mobile, village, preferredMilkType } = req.body;
    let updateData = { farmerId, name, username, mobile, village, preferredMilkType };

    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await Farmer.findByIdAndUpdate(req.params.id, updateData);
    res.redirect("/agent/farmers");
  } catch (error) {
    console.log(error);
    res.status(500).send("Update Error");
  }
});

/* 🗑 Delete Farmer Route */
app.get("/agent/delete-farmer/:id", isAgentLoggedIn, async (req, res) => {
  try {
    await Farmer.findByIdAndDelete(req.params.id);
    res.redirect("/agent/farmers");
  } catch (error) {
    console.log(error);
    res.status(500).send("Delete Error");
  }
});

/* ========================================================
   AUTHENTICATION POST ROUTES
   ======================================================== */

app.post("/collectionagentlogin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const agent = await CollectionAgent.findOne({ username: username.trim() });

    if (!agent) {
      return res.send("Invalid Username");
    }

    const isMatch = await bcrypt.compare(password, agent.password);
    if (!isMatch) {
      return res.send("Invalid Password");
    }

    req.session.agent = agent._id;
    res.redirect("/collectionagentdashboardmenu");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});
/*collection agent logout route*/
app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {

            console.log(err);

            return res.redirect(
                "/collectionagentdashboardmenu"
            );
        }

        res.clearCookie("connect.sid");

        res.redirect("/");
    });

});

app.post("/collectionagentsignup", async (req, res) => {
  try {
    const { agentId, name, username, password, mobile, email, centerName, village } = req.body;
    const existingAgent = await CollectionAgent.findOne({
      $or: [{ agentId }, { username }]
    });

    if (existingAgent) {
      return res.send("Agent ID or Username already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await CollectionAgent.create({
      agentId,
      name,
      username,
      password: hashedPassword,
      mobile,
      email,
      centerName,
      village
    });

    res.redirect("/collectionagentlogin");
  } catch (error) {
    console.log(error);
    res.status(500).send("Unable to Create Account");
  }
});

app.post("/farmerlogin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const farmer = await Farmer.findOne({ username: username.trim() });

    if (!farmer) {
      return res.send("Invalid Username");
    }

    const isMatch = await bcrypt.compare(password, farmer.password);
    if (!isMatch) {
      return res.send("Invalid Password");
    }

    req.session.farmer = farmer._id;
    res.redirect("/farmerdashboardmenu");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

/* Password Reset Links */
app.get("/collectionagentresetpassword/:id", (req, res) => {
  res.render("collectionagentresetpassword", { id: req.params.id });
});

app.get("/farmerresetpassword/:id", (req, res) => {
  res.render("farmerresetpassword", { id: req.params.id });
});

app.post("/collectionagentforgotpassword", async (req, res) => {
  try {
    const { username, mobile } = req.body;
    const agent = await CollectionAgent.findOne({
      username: username.trim(),
      mobile: mobile.trim()
    });

    if (!agent) {
      return res.send("Invalid Username or Mobile Number");
    }
    res.redirect(`/collectionagentresetpassword/${agent._id}`);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

app.post("/collectionagentresetpassword/:id", async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await CollectionAgent.findByIdAndUpdate(req.params.id, { password: hashedPassword });
    res.redirect("/collectionagentlogin");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

app.post("/farmerforgotpassword", async (req, res) => {
  try {
    const { username, mobile } = req.body;
    const farmer = await Farmer.findOne({
      username: username.trim(),
      mobile: mobile.trim()
    });

    if (!farmer) {
      return res.send("Invalid Username or Mobile Number");
    }
    res.redirect(`/farmerresetpassword/${farmer._id}`);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});

app.post("/farmerresetpassword/:id", async (req, res) => {
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await Farmer.findByIdAndUpdate(req.params.id, { password: hashedPassword });
    res.redirect("/farmerlogin");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
});
/*milk collection routes start here*/
/* 🥛 Get Milk Collections Page Route */
/* ========================================================
   🥛 MILK COLLECTION MANAGEMENT ROUTES
   ======================================================== */

/* 1. 📥 పాల సేకరణ పేజీని మరియు నేటి రికార్డులను లోడ్ చేసే రూట్ (GET) */
/* 1. 📥 పాల సేకరణ పేజీని మరియు నేటి రికార్డులను లోడ్ చేసే రూట్ (GET) */
app.get("/agent/collections", isAgentLoggedIn, async (req, res) => {
  try {
    const farmers = await Farmer.find().sort({ name: 1 }).lean();
    
    const collections = await MilkCollection.find()
      .populate("farmerId")
      .sort({ createdAt: -1 })
      .lean();

    const formattedCollections = collections.map(doc => {
      const d = doc.createdAt ? new Date(doc.createdAt) : new Date();
      return {
        ...doc,
        farmerId: doc.farmerId || { farmerId: "N/A" },
        // DD/MM/YYYY ఫార్మాట్ కొరకు
        dateString: d.toLocaleDateString('en-IN') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      };
    });

    res.render("collections", { farmers, collections: formattedCollections });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error loading milk collections page");
  }
});

/* 2. 📥 కొత్త పాల సేకరణ ఎంట్రీని మోంగోడిబి లో సేవ్ చేసే రూట్ (POST) */
app.post("/agent/collections", isAgentLoggedIn, async (req, res) => {
  try {
    const {
      farmerId,
      session,
      milkType,
      liters,
      fat,
      snf,
      calcMethod,
      rate,
      fatPrice,
      snfPrice,
      totalAmount,
      manualEntry
    } = req.body;

    const parsedLiters = parseFloat(liters) || 0;
    const parsedFat = parseFloat(fat) || 0;
    const parsedSnf =
    calcMethod === 'fatBased'
        ? 0
        : parseFloat(snf) || 0;
    const parsedRate = parseFloat(rate) || 0;
    const parsedFatPrice = parseFloat(fatPrice) || 0;
    const parsedSnfPrice = parseFloat(snfPrice) || 0;
    const parsedTotalAmount = parseFloat(totalAmount) || 0;
    const readingSource =
  manualEntry ? "Manual" : "Machine";

let finalRate = parsedRate;
let finalFatPrice = parsedFatPrice;
let finalSnfPrice = parsedSnfPrice;

// Keep database clean
if (calcMethod === "dynamicTS") {
  finalFatPrice = 0;
  finalSnfPrice = 0;
}

if (calcMethod === "twoAxis") {
  finalRate =
    (parsedFat * finalFatPrice) +
    (parsedSnf * finalSnfPrice);
}
if (
  parsedLiters <= 0 ||
  parsedFat <= 0 ||
  (
    calcMethod !== "fatBased" &&
    parsedSnf <= 0
  )
) {
  return res.status(400).send(
    "Liters, FAT and SNF readings are required."
  );
}
if (!farmerId || !session || !milkType) {
  return res.status(400).send(
    "Farmer, Session and Milk Type are required."
  );
}

await MilkCollection.create({
  collectionAgent: req.session.agent,
  farmerId,
  session,
  milkType,
  readingSource,
  liters: parsedLiters,
  fat: parsedFat,
  snf: parsedSnf,
  calcMethod,
  rate: finalRate,
  fatPrice: finalFatPrice,
  snfPrice: finalSnfPrice,
  totalAmount: parsedTotalAmount
});

    if (req.xhr ||
        (req.headers.accept &&
         req.headers.accept.indexOf('json') > -1)) {
      return res.json({
        success: true,
        message: "పాల సేకరణ విజయవంతంగా నమోదైనది!"
      });
    }

    return res.redirect("/agent/collections");

  } catch (error) {
    console.error("MongoDB Save Error Details:", error);
    res.status(500).send("Error saving milk entry to database");
  }
});

/* 3. ✏️ ఎడిట్ చేయడానికి నిర్దిష్ట రికార్డు డేటాను ఫారమ్‌లోకి తెచ్చే రూట్ (GET) */
app.get("/agent/edit-collection/:id", isAgentLoggedIn, async (req, res) => {
  try {
    const collection = await MilkCollection.findById(req.params.id).lean();
    const farmers = await Farmer.find().sort({ name: 1 }).lean();
    const collectionsList = await MilkCollection.find().populate("farmerId").sort({ createdAt: -1 }).lean();

    const formattedCollections = collectionsList.map(doc => {
      const d = doc.createdAt ? new Date(doc.createdAt) : new Date();
      return { 
        ...doc, 
        farmerId: doc.farmerId || { farmerId: "N/A" },
        dateString: d.toLocaleDateString('en-IN') 
      };
    });

    res.render("collections", { collection, farmers, collections: formattedCollections });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error loading edit form");
  }
});

/* 4. 🔄 ఎడిట్ చేసిన రికార్డును డేటాబేస్ లో అప్‌డేట్ చేసే రూట్ (POST) */
app.post("/agent/update-collection/:id", isAgentLoggedIn, async (req, res) => {
  try {
    let {
  farmerId,
  session,
  milkType,
  liters,
  fat,
  snf,
  calcMethod,
  rate,
  fatPrice,
  snfPrice,
  totalAmount,
  manualEntry
} = req.body;
    const parsedLiters = parseFloat(liters) || 0;
    const parsedFat = parseFloat(fat) || 0;
    const parsedSnf =
    calcMethod === 'fatBased'
        ? 0
        : parseFloat(snf) || 0;
    let parsedRate = parseFloat(rate) || 0;
    let parsedFatPrice = parseFloat(fatPrice) || 0;
    let parsedSnfPrice = parseFloat(snfPrice) || 0;
    const parsedTotalAmount = parseFloat(totalAmount) || 0;
    const readingSource =manualEntry ? "Manual" : "Machine";

    // Keep database clean
    if (calcMethod === "dynamicTS") {
      parsedFatPrice = 0;
      parsedSnfPrice = 0;
    }

    if (calcMethod === "twoAxis") {
      parsedRate = 0;
    }
if (
  parsedLiters <= 0 ||
  parsedFat <= 0 ||
  (
    calcMethod !== 'fatBased' &&
    parsedSnf <= 0
  )
) {
  return res.status(400).send(
    "Required readings are missing."
  );
}
    await MilkCollection.findByIdAndUpdate(
  req.params.id,
  {
    collectionAgent: req.session.agent,
    farmerId,
    session,
    milkType,
    readingSource,
    liters: parsedLiters,
    fat: parsedFat,
    snf: parsedSnf,
    calcMethod,
    rate: parsedRate,
    fatPrice: parsedFatPrice,
    snfPrice: parsedSnfPrice,
    totalAmount: parsedTotalAmount
  }
);
    res.redirect("/agent/collections");

  } catch (error) {
    console.log(error);
    res.status(500).send("Error updating milk collection record");
  }
});
/* 5. 🗑 పాల సేకరణ రికార్డును డిలీట్ చేసే రూట్ (GET) */
app.get("/agent/delete-collection/:id", isAgentLoggedIn, async (req, res) => {
  try {
    await MilkCollection.findByIdAndDelete(req.params.id);
    res.redirect("/agent/collections");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error deleting milk record");
  }
});
/*agent delete milk collections from dashboard route*/
app.post("/agent/delete-collection/:id", isAgentLoggedIn, async (req, res) => {
  try {

    await MilkCollection.findByIdAndDelete(req.params.id);

    res.redirect("/agent/collections");

  } catch (error) {

    console.log(error);

    res.status(500).send("Error deleting milk record");
  }
});

/*base rate and snf and fat rates given by collection agent routes for update*/
app.get("/agent/base-rate/:milkType", async (req, res) => {
    try {
        const { milkType } = req.params;

        const rates = await BaseRate.findOne({ milkType });

        if (!rates) {
            return res.json({
                tsRate: 0,
                fatPrice: 0,
                snfPrice: 0
            });
        }

        res.json(rates);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
    }
});
app.post("/agent/base-rate", async (req, res) => {
    try {
        const {
            milkType,
            tsRate,
            fatPrice,
            snfPrice
        } = req.body;

        const rates = await BaseRate.findOneAndUpdate(
    { milkType },
    {
        tsRate,
        fatPrice,
        snfPrice,
        updatedAt: new Date()
    },
    {
        returnDocument: "after",
        upsert: true
    }
);
        res.json({
            success: true,
            message: "Rates Updated Successfully",
            rates
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
});
app.post("/agent/base-rate/ts", async (req, res) => {
    try {
        const { milkType, tsRate } = req.body;

        const rates = await BaseRate.findOneAndUpdate(
            { milkType },
            { tsRate },
            {
                new: true,
                upsert: true
            }
        );

        res.json(rates);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
/*update two axis rates*/
app.post("/agent/base-rate/two-axis", async (req, res) => {
    try {
        const {
            milkType,
            fatPrice,
            snfPrice
        } = req.body;

        const rates = await BaseRate.findOneAndUpdate(
            { milkType },
            {
                fatPrice,
                snfPrice
            },
            {
                new: true,
                upsert: true
            }
        );

        res.json(rates);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
/*farmer ledger routes*/
app.get("/agent/farmer-ledger", async (req, res) => {

    try {

        const farmers =
            await Farmer.find()
                .sort({
                    farmerId: 1
                });

        res.render("farmerledger", {

            farmers,

            farmer: null,

            ledgerEntries: [],

            summary: {

                totalLiters: 0,

                grossAmount: 0,

                totalAdvance: 0,

                bonusAmount: 0,

                deductionAmount: 0,

                netPayable: 0,

                paidAmount: 0,

                netBalance: 0,

                morningMilk: 0,

                morningAmount: 0,

                eveningMilk: 0,

                eveningAmount: 0

            }

        });

    }

    catch (err) {

        console.log(err);

        res.send(
            "Unable to load Farmer Ledger."
        );

    }

});
app.get("/api/farmer-ledger", async (req, res) => {
    try {

        const {
            farmer,
            fromDate,
            toDate
        } = req.query;

        const farmerData =
            await Farmer.findOne({

                $or: [

                    {
                        farmerId:
                            farmer.toUpperCase()
                    },

                    {
                        name:
                            new RegExp(
                                farmer,
                                "i"
                            )
                    }

                ]

            });

        if (!farmerData) {

            return res.json({

                success: false,

                message:
                    "Farmer not found."

            });

        }

        const filter = {

            farmerId:
                farmerData._id

        };

        if (fromDate && toDate) {

            filter.collectionDate = {

                $gte:
                    new Date(fromDate),

                $lte:
                    new Date(
                        toDate +
                        "T23:59:59"
                    )

            };

        }

        const ledgerEntries =
            await MilkCollection.find(filter)
                .sort({
                    collectionDate: -1
                });

        /* Payment Summary */

        const payment =
            await Payment.findOne({

                farmerId:
                    farmerData._id

            });

        let summary = {

            totalLiters: 0,

            grossAmount: 0,

            totalAdvance: 0,

            bonusAmount: 0,

            deductionAmount: 0,

            netPayable: 0,

            paidAmount: 0,

            netBalance: 0,

            morningMilk: 0,

            morningAmount: 0,

            eveningMilk: 0,

            eveningAmount: 0

        };

        /* Milk Summary */

        ledgerEntries.forEach(item => {

            summary.totalLiters +=
                item.liters || 0;

            summary.grossAmount +=
                item.totalAmount || 0;

            if (item.session === "Morning") {

                summary.morningMilk +=
                    item.liters || 0;

                summary.morningAmount +=
                    item.totalAmount || 0;

            }

            if (item.session === "Evening") {

                summary.eveningMilk +=
                    item.liters || 0;

                summary.eveningAmount +=
                    item.totalAmount || 0;

            }

        });

        /* Payment Summary */

        if (payment) {

            summary.totalAdvance =
                payment.advanceAmount || 0;

            summary.bonusAmount =
                payment.bonusAmount || 0;

            summary.deductionAmount =
                payment.deductionAmount || 0;

            summary.netPayable =
                payment.netPayableAmount || 0;

            summary.paidAmount =
                payment.paidAmount || 0;

            summary.netBalance =
                payment.balanceDue || 0;

        }

        res.json({

            success: true,

            farmer:
                farmerData,

            ledgerEntries,

            summary

        });

    }

    catch (err) {

        console.log(err);

        res.json({

            success: false,

            message:
                "Unable to load ledger."

        });

    }

});
app.get(
    "/agent/farmer-ledger/:id",
    async (req, res) => {
        try {

            const agent =
                await CollectionAgent.findById(
                    req.session.agent
                );

            const farmer =
                await Farmer.findById(
                    req.params.id
                );

            if (!farmer) {
                return res.send(
                    "Farmer not found."
                );
            }

            const ledgerEntries =
                await MilkCollection.find({
                    farmerId: farmer._id
                }).sort({
                    collectionDate: -1
                });
                const payment =
    await Payment.findOne({

        farmerId: farmer._id

    });

            let summary = {
    totalLiters: 0,
    grossAmount: 0,

    totalAdvance: 0,
    bonusAmount: 0,
    deductionAmount: 0,

    netPayable: 0,
    paidAmount: 0,
    netBalance: 0,

    morningMilk: 0,
    morningAmount: 0,

    eveningMilk: 0,
    eveningAmount: 0
};

            ledgerEntries.forEach(item => {

    summary.totalLiters +=
        item.liters || 0;

    summary.grossAmount +=
        item.totalAmount || 0;

    if (item.session === "Morning") {

        summary.morningMilk +=
            item.liters || 0;

        summary.morningAmount +=
            item.totalAmount || 0;

    }

    if (item.session === "Evening") {

        summary.eveningMilk +=
            item.liters || 0;

        summary.eveningAmount +=
            item.totalAmount || 0;

    }

});
if (payment) {

    summary.totalAdvance =
        payment.advanceAmount || 0;

    summary.paidAmount =
        payment.paidAmount || 0;

    summary.netBalance =
        payment.balanceDue || 0;

    summary.netPayable =
        payment.netPayableAmount || 0;

    summary.bonusAmount =
        payment.bonusAmount || 0;

    summary.deductionAmount =
        payment.deductionAmount || 0;

}

            res.render(
                "farmerledger",
                {
                    agent,
                    farmer,
                    ledgerEntries,
                    summary
                }
            );

        } catch (err) {
            console.log(err);
            res.send(
                "Unable to load ledger."
            );
        }
    }
);

/*fat rate chart rates saved data base route*/
app.post('/agent/fat-rate', async (req, res) => {
  try {
    const {
      milkType,
      fatFrom,
      fatTo,
      rate,
      effectiveFrom,
      id
    } = req.body;

    const parsedFatFrom = parseFloat(fatFrom) || 0;
    const parsedFatTo = parseFloat(fatTo) || 0;
    const parsedRate = parseFloat(rate) || 0;

    if (!milkType || !effectiveFrom || parsedFatFrom < 0 || parsedFatTo < 0 || parsedRate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid FAT slab data.'
      });
    }

    if (parsedFatFrom > parsedFatTo) {
      return res.status(400).json({
        success: false,
        message: 'FAT From cannot be greater than FAT To.'
      });
    }

    if (id) {
      await FatRate.findByIdAndUpdate(id, {
        milkType,
        fromFat: parsedFatFrom,
        toFat: parsedFatTo,
        rate: parsedRate,
        effectiveFrom
      });

      return res.json({
        success: true,
        message: 'FAT slab updated successfully.'
      });
    }

    await FatRate.create({
      milkType,
      fromFat: parsedFatFrom,
      toFat: parsedFatTo,
      rate: parsedRate,
      effectiveFrom
    });

    res.json({
      success: true,
      message: 'FAT slab saved successfully.'
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: 'Failed to save slab.'
    });
  }
});
/*chart for fat rates revise edit and delete*/
app.get('/agent/fat-rates/:milkType', async (req, res) => {
  try {
    const slabs = await FatRate.find({
      milkType: req.params.milkType
    }).sort({
      effectiveFrom: -1,
      fromFat: 1
    });

    res.json(slabs);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch fat rates"
    });
  }
});
/*fat rates delete route*/
app.delete('/agent/fat-rate/:id', async (req, res) => {
  try {
    await FatRate.findByIdAndDelete(req.params.id);

    res.json({
      success: true
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete fat rate"
    });
  }
});


/*edit route of fat rate chart*/
app.put('/agent/fat-rate/:id', async (req, res) => {
  try {
    const {
      fromFat,
      toFat,
      rate,
      effectiveFrom
    } = req.body;

    const parsedFromFat = parseFloat(fromFat) || 0;
    const parsedToFat = parseFloat(toFat) || 0;
    const parsedRate = parseFloat(rate) || 0;

    await FatRate.findByIdAndUpdate(
      req.params.id,
      {
        fromFat: parsedFromFat,
        toFat: parsedToFat,
        rate: parsedRate,
        effectiveFrom
      }
    );

    res.json({
      success: true
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Failed to update fat rate"
    });
  }
});
/*payment routes*/
app.get("/agent/totals", async (req, res) => {

    try {

        const transactions =
            await PaymentTransaction.find();

        let totalPaid = 0;

        let cashPayments = 0;

        let upiPayments = 0;

        let bankPayments = 0;
        let chequePayments = 0;

        transactions.forEach(t => {

            if (
    t.paymentStatus === "Paid" ||
    t.paymentStatus === "Partial"
) {

                totalPaid += t.transactionAmount;

                if (t.paymentMethod === "Cash")
                    cashPayments += t.transactionAmount;

                if (t.paymentMethod === "UPI")
                    upiPayments += t.transactionAmount;

                if (t.paymentMethod === "Bank Transfer")
                    bankPayments += t.transactionAmount;              
                if (t.paymentMethod === "Cheque")
                    chequePayments += t.transactionAmount;

            }

        });

        res.json({

            totalTransactions: transactions.length,

            totalPaid,

            cashPayments,

            upiPayments,

            bankPayments,
            chequePayments

        });

    } catch (err) {

        res.status(500).json({
            message: err.message
        });

    }

});

app.get("/agent/payments", async (req, res) => {

    try {

        // Get all milk collections
        const collections =
            await MilkCollection.find()
                .populate(
                    "farmerId",
                    "farmerId name"
                );

        const farmerMap = {};

        // Calculate lifetime milk summary
        collections.forEach(collection => {

            const key =
                collection.farmerId._id.toString();

            if (!farmerMap[key]) {

                farmerMap[key] = {

                    farmerId:
                        collection.farmerId,

                    totalCollectionDays: 0,

                    totalLiters: 0,

                    totalMilkAmount: 0,

                    dates: new Set()

                };

            }

            farmerMap[key].totalLiters +=
                collection.liters;

            farmerMap[key].totalMilkAmount +=
                collection.totalAmount;

            farmerMap[key].dates.add(

                collection.collectionDate
                    .toISOString()
                    .split("T")[0]

            );

        });

        const paymentRows = [];

        for (const key in farmerMap) {

            const summary =
                farmerMap[key];

            summary.totalCollectionDays =
                summary.dates.size;

            delete summary.dates;

            // One Payment document per farmer
            const payment =
                await Payment.findOne({

                    farmerId:
                        summary.farmerId._id

                });

            if (payment) {

                // Payment Summary

                summary.advanceAmount =
                    payment.advanceAmount || 0;

                summary.bonusAmount =
                    payment.bonusAmount || 0;

                summary.deductionAmount =
                    payment.deductionAmount || 0;

                summary.netPayableAmount =
                    payment.netPayableAmount || summary.totalMilkAmount;

                summary.paidAmount =
                    payment.paidAmount || 0;

                summary.balanceDue =
                    payment.balanceDue || 0;

                summary.paymentStatus =
                    payment.paymentStatus || "Pending";

                summary.lastPaymentMethod =
               payment.lastPaymentMethod || "";

               summary.lastPaymentDate =
               payment.lastPaymentDate || null;
                summary.pdfGenerated =
                    payment.pdfGenerated || false;

                summary.whatsappSent =
                    payment.whatsappSent || false;

                summary._id =
                    payment._id;

            }

            else {

                // First payment

                summary.advanceAmount = 0;

                summary.bonusAmount = 0;

                summary.deductionAmount = 0;

                summary.netPayableAmount =
                    summary.totalMilkAmount;

                summary.paidAmount = 0;

                summary.balanceDue =
                    summary.totalMilkAmount;

                summary.paymentStatus =
                    "Pending";

                summary.lastPaymentMethod = "";
                summary.lastPaymentDate = null;
                summary.pdfGenerated = false;

                summary.whatsappSent = false;

                summary._id = null;

            }

            paymentRows.push(summary);

        }

        res.render("payment", {

            payments: paymentRows

        });

    }

    catch (err) {

        console.log(err);

        res.status(500).send(err.message);

    }

});
app.post("/agent/api/pay/:id", async (req, res) => {

    try {

        const {

            farmerId,

            totalCollectionDays,

            totalLiters,

            totalMilkAmount,

            advanceAmount,

            bonusAmount,

            deductionAmount,

            netPayableAmount,

            paidAmount,

            paymentMethod,

            remarks

        } = req.body;

        const parsedTotalCollectionDays =
            parseInt(totalCollectionDays) || 0;

        const parsedTotalLiters =
            parseFloat(totalLiters) || 0;

        const parsedTotalMilkAmount =
            parseFloat(totalMilkAmount) || 0;

        const parsedAdvanceAmount =
            parseFloat(advanceAmount) || 0;

        const parsedBonusAmount =
            parseFloat(bonusAmount) || 0;

        const parsedDeductionAmount =
            parseFloat(deductionAmount) || 0;

        const parsedNetPayableAmount =
            parseFloat(netPayableAmount) || 0;

        const parsedPaidAmount =
            parseFloat(paidAmount) || 0;

        /* Validation */

        if (!farmerId) {

            return res.status(400).json({

                success: false,

                message: "Farmer Id is missing."

            });

        }

        if (parsedNetPayableAmount <= 0) {

            return res.status(400).json({

                success: false,

                message: "Invalid Net Payable Amount."

            });

        }

        if (parsedPaidAmount <= 0) {

            return res.status(400).json({

                success: false,

                message: "Please enter a valid amount."

            });

        }

        /* Find Existing Summary */

        let payment =
            await Payment.findOne({

                farmerId

            });

        /* Create First Summary */

        if (!payment) {

            payment = new Payment({

                farmerId,

                totalCollectionDays:
                    parsedTotalCollectionDays,

                totalLiters:
                    parsedTotalLiters,

                totalMilkAmount:
                    parsedTotalMilkAmount,

                advanceAmount:
                    parsedAdvanceAmount,

                bonusAmount:
                    parsedBonusAmount,

                deductionAmount:
                    parsedDeductionAmount,

                netPayableAmount:
                    parsedNetPayableAmount,

                paidAmount: 0,

                balanceDue:
                    parsedNetPayableAmount,

                paymentStatus: "Pending",

                lastPaymentMethod: "",
                lastPaymentDate: null,
                pdfGenerated: false,

                whatsappSent: false

            });

        }

        /* Update Summary */

        payment.totalCollectionDays =
            parsedTotalCollectionDays;

        payment.totalLiters =
            parsedTotalLiters;

        payment.totalMilkAmount =
            parsedTotalMilkAmount;

        payment.advanceAmount =
            parsedAdvanceAmount;

        payment.bonusAmount =
            parsedBonusAmount;

        payment.deductionAmount =
            parsedDeductionAmount;

        payment.netPayableAmount =
            parsedNetPayableAmount;

        const currentBalance =
            payment.netPayableAmount -
            payment.paidAmount;

        if (parsedPaidAmount > currentBalance) {

            return res.status(400).json({

                success: false,

                message:
                    "Payment cannot exceed Balance Due."

            });

        }

        payment.paidAmount +=
            parsedPaidAmount;

        payment.balanceDue =
            payment.netPayableAmount -
            payment.paidAmount;

        payment.lastPaymentMethod =
    paymentMethod;

payment.lastPaymentDate =
    new Date();
        payment.remarks =
            remarks || "";

        if (payment.balanceDue <= 0) {

            payment.paymentStatus = "Paid";

        }

        else if (payment.paidAmount > 0) {

            payment.paymentStatus = "Partial";

        }

        else {

            payment.paymentStatus = "Pending";

        }
        payment.lastPaymentMethod =
    paymentMethod;

payment.lastPaymentDate =
    new Date();

console.log(
    "Before Save Method:",
    payment.lastPaymentMethod
);

console.log(
    "Before Save Date:",
    payment.lastPaymentDate
);


        await payment.save();
       await PaymentTransaction.create({

    paymentId:
        payment._id,

    farmerId:
        payment.farmerId,

    transactionNumber:
        `TXN-${Date.now()}`,

    paymentType:
        "Settlement",

    transactionAmount:
        parsedPaidAmount,

    paymentMethod:
        paymentMethod,

    paymentDate:
        payment.lastPaymentDate,

    remarks:
        remarks || "",

    transactionReference:
        "",

    paymentStatus:
        payment.paymentStatus,

    pdfGenerated:
        false,

    pdfGeneratedAt:
        null,

    whatsappSent:
        false,

    whatsappSentAt:
        null

});


        res.json({

            success: true,

            paymentId:
                payment._id

        });

    }

    catch (err) {

        console.log(err);

        res.status(500).json({

            success: false,

            message:
                err.message

        });

    }

});
app.get(
    "/agent/api/payments/download-pdf/:farmerId",
    async (req, res) => {

        res.send(
            "PDF Generation Coming Soon"
        );

    }
);
app.post(
    "/agent/api/payments/send-whatsapp",
    async (req, res) => {

        res.json({

            success: true

        });

    }
);
/*payment transaction routes*/
app.get("/agent/payment-transactions", async (req, res) => {

    try {

        const {
            search = "",
            paymentType = "",
            paymentMethod = "",
            paymentStatus = "",
            fromDate = "",
            toDate = ""
        } = req.query;

        const filter = {};

        if (paymentType)
            filter.paymentType = paymentType;

        if (paymentMethod)
            filter.paymentMethod = paymentMethod;

        if (paymentStatus)
            filter.paymentStatus = paymentStatus;

        if (fromDate || toDate) {

            filter.paymentDate = {};

            if (fromDate)
                filter.paymentDate.$gte =
                    new Date(fromDate);

            if (toDate) {

                const endDate =
                    new Date(toDate);

                endDate.setHours(
                    23, 59, 59, 999
                );

                filter.paymentDate.$lte =
                    endDate;
            }
        }

        let transactions =
            await PaymentTransaction
                .find(filter)
                .populate(
                    "farmerId",
                    "farmerId name"
                )
                .sort({
                    paymentDate: -1
                });

        if (search) {

            const searchText =
                search.toLowerCase();

            transactions =
                transactions.filter(t => {

                    const farmerCode =
                        t.farmerId?.farmerId
                            ?.toLowerCase() || "";

                    const farmerName =
                        t.farmerId?.name
                            ?.toLowerCase() || "";

                    return (
                        farmerCode.includes(searchText) ||
                        farmerName.includes(searchText)
                    );
                });
        }

        const totalPaid =
            transactions.reduce(
                (sum, t) =>
                    sum + t.transactionAmount,
                0
            );

        const cashPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Cash"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const upiPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "UPI"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const bankPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Bank Transfer"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const chequePayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Cheque"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        res.render(
            "paymenttransactions",
            {
                transactions,

                totalTransactions:
                    transactions.length,

                totalPaid:
                    totalPaid.toFixed(2),

                cashPayments:
                    cashPayments.toFixed(2),

                upiPayments:
                    upiPayments.toFixed(2),

                bankPayments:
                    bankPayments.toFixed(2),

                chequePayments:
                    chequePayments.toFixed(2),

                search,
                paymentType,
                paymentMethod,
                paymentStatus,
                fromDate,
                toDate
            }
        );

    } catch (err) {

        console.error(err);

        res.status(500)
            .send(
                "Error loading transactions"
            );
    }
});
app.get(
    "/agent/payment-transactions/export",
    async (req, res) => {
try {

        const {
            search = "",
            paymentType = "",
            paymentMethod = "",
            paymentStatus = "",
            fromDate = "",
            toDate = ""
        } = req.query;

        const filter = {};

        if (paymentType)
            filter.paymentType = paymentType;

        if (paymentMethod)
            filter.paymentMethod = paymentMethod;

        if (paymentStatus)
            filter.paymentStatus = paymentStatus;

        if (fromDate || toDate) {

            filter.paymentDate = {};

            if (fromDate)
                filter.paymentDate.$gte =
                    new Date(fromDate);

            if (toDate) {

                const endDate =
                    new Date(toDate);

                endDate.setHours(
                    23, 59, 59, 999
                );

                filter.paymentDate.$lte =
                    endDate;
            }
        }

        let transactions =
            await PaymentTransaction
                .find(filter)
                .populate(
                    "farmerId",
                    "farmerId name"
                )
                .sort({
                    paymentDate: -1
                });

        if (search) {

            const searchText =
                search.toLowerCase();

            transactions =
                transactions.filter(t => {

                    const farmerCode =
                        t.farmerId?.farmerId
                            ?.toLowerCase() || "";

                    const farmerName =
                        t.farmerId?.name
                            ?.toLowerCase() || "";

                    return (
                        farmerCode.includes(searchText) ||
                        farmerName.includes(searchText)
                    );
                });
        }

        const totalPaid =
            transactions.reduce(
                (sum, t) =>
                    sum + t.transactionAmount,
                0
            );

        const cashPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Cash"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const upiPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "UPI"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const bankPayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Bank Transfer"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        const chequePayments =
            transactions
                .filter(
                    t =>
                        t.paymentMethod ===
                        "Cheque"
                )
                .reduce(
                    (sum, t) =>
                        sum + t.transactionAmount,
                    0
                );

        res.render(
            "paymenttransactions",
            {
                transactions,

                totalTransactions:
                    transactions.length,

                totalPaid:
                    totalPaid.toFixed(2),

                cashPayments:
                    cashPayments.toFixed(2),

                upiPayments:
                    upiPayments.toFixed(2),

                bankPayments:
                    bankPayments.toFixed(2),

                chequePayments:
                    chequePayments.toFixed(2),

                search,
                paymentType,
                paymentMethod,
                paymentStatus,
                fromDate,
                toDate
            }
        );

    } catch (err) {

        console.error(err);

        res.status(500)
            .send(
                "Error loading transactions"
            );
    }
});
app.get(
    "/agent/payment-transactions/view/:id",
    async (req, res) => {

        const transaction =
            await PaymentTransaction
                .findById(req.params.id)
                .populate("farmerId")
                .populate("paymentId");

        if (!transaction)
            return res
                .status(404)
                .send(
                    "Transaction not found"
                );

        res.render(
            "view-payment-transaction",
            {
                transaction
            }
        );
    }
);
app.get(
    "/agent/payment-transactions/delete/:id",
    async (req, res) => {

        try {

            await PaymentTransaction
                .findByIdAndDelete(
                    req.params.id
                );

            res.redirect(
                "/agent/payment-transactions"
            );

        } catch (err) {

            console.error(err);

            res.status(500)
                .send(
                    "Delete failed"
                );
        }
    }
);
/*farmer login routes begin here*/
app.get("/farmerlogout", (req, res) => {

    req.session.farmer = null;

    req.session.destroy(() => {

        res.redirect("/farmerlogin");

    });

});
app.get(
  "/farmerdashboardmenu",
  isFarmerLoggedIn,
  async (req, res) => {

    try {

      const farmerId = req.session.farmer;

      const farmer =
        await Farmer.findById(farmerId).lean();

      if (!farmer) {
        return res.redirect("/farmerlogin");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Today's collections
      const todayCollections =
        await MilkCollection.find({
          farmerId,
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        })
        .sort({ createdAt: -1 })
        .lean();

      const todayMilk =
        todayCollections.reduce(
          (sum, row) => sum + (row.liters || 0),
          0
        );

      const todayAmount =
        todayCollections.reduce(
          (sum, row) => sum + (row.totalAmount || 0),
          0
        );

      // Month Collections
      const startOfMonth =
        new Date(
          today.getFullYear(),
          today.getMonth(),
          1
        );

      const monthCollections =
        await MilkCollection.find({
          farmerId,
          createdAt: {
            $gte: startOfMonth
          }
        }).lean();

      const monthMilk =
        monthCollections.reduce(
          (sum, row) => sum + (row.liters || 0),
          0
        );

      const monthEarnings =
        monthCollections.reduce(
          (sum, row) => sum + (row.totalAmount || 0),
          0
        );

      const avgFat =
        monthCollections.length
          ? (
              monthCollections.reduce(
                (s, r) => s + (r.fat || 0),
                0
              ) /
              monthCollections.length
            ).toFixed(2)
          : "0.00";

      const avgSnf =
        monthCollections.length
          ? (
              monthCollections.reduce(
                (s, r) => s + (r.snf || 0),
                0
              ) /
              monthCollections.length
            ).toFixed(2)
          : "0.00";

      // Payments
      const payments =
        await PaymentTransaction.find({
          farmerId
        })
        .sort({
          paymentDate: -1
        })
        .lean();

      const totalPaid =
        payments.reduce(
          (sum, p) =>
            sum +
            (p.transactionAmount || 0),
          0
        );

      const pendingAmount =
        monthEarnings - totalPaid;

      const lastPayment =
        payments[0] || null;

      const lastCollections =
        await MilkCollection.find({
          farmerId
        })
        .sort({
          createdAt: -1
        })
        .limit(10)
        .lean();

      res.render(
        "farmerdashboardmenu",
        {
          farmer,

          todayMilk:
            todayMilk.toFixed(2),

          todayAmount:
            todayAmount.toFixed(2),

          monthMilk:
            monthMilk.toFixed(2),

          monthEarnings:
            monthEarnings.toFixed(2),

          avgFat,

          avgSnf,

          totalPaid:
            totalPaid.toFixed(2),

          pendingAmount:
            pendingAmount.toFixed(2),

          lastPayment,

          todayCollections,

          lastCollections,

          payments
        }
      );

    } catch (err) {

      console.log(err);

      res.status(500)
         .send("Dashboard Error");

    }
});

app.get(
    "/farmer/collections",
    isFarmerLoggedIn,
    async (req, res) => {

        try {

            const farmer =
                await Farmer.findById(
                    req.session.farmer
                );

            const collections =
                await MilkCollection.find({

                    farmerId:
                        farmer._id

                })
                .sort({
                    createdAt: -1
                })
                .lean();

            res.render(
                "farmercollections",
                {
                    farmer,
                    collections
                }
            );

        }

        catch (err) {

            console.log(err);

            res.send(
                "Unable to load collections"
            );

        }

    }
);
app.get(
    "/farmer/payments",
    isFarmerLoggedIn,
    async (req, res) => {

        try {

            const farmer =
                await Farmer.findById(
                    req.session.farmer
                );

            const payments =
                await PaymentTransaction.find({

                    farmerId:
                        farmer._id

                })
                .sort({
                    paymentDate: -1
                })
                .lean();

            res.render(
                "farmerpayments",
                {
                    farmer,
                    payments
                }
            );

        }

        catch (err) {

            console.log(err);

            res.send(
                "Unable to load payments"
            );

        }

    }
);
app.get(
    "/farmer/statement",
    isFarmerLoggedIn,
    async (req, res) => {

        try {

            const farmer =
                await Farmer.findById(
                    req.session.farmer
                );

            const collections =
                await MilkCollection.find({

                    farmerId:
                        farmer._id

                })
                .sort({
                    createdAt: -1
                })
                .lean();

            const payments =
                await PaymentTransaction.find({

                    farmerId:
                        farmer._id

                }).lean();

            res.render(
                "farmerstatement",
                {
                    farmer,
                    collections,
                    payments
                }
            );

        }

        catch (err) {

            console.log(err);

            res.send(
                "Unable to load statement"
            );

        }

    }
);
app.get(
    "/farmer/changepassword",
    isFarmerLoggedIn,
    (req, res) => {

        res.render(
            "farmerchangepassword"
        );

    }
);
app.post(
    "/farmer/changepassword",
    isFarmerLoggedIn,
    async (req, res) => {

        try {

            const {

                oldPassword,
                newPassword

            } = req.body;

            const farmer =
                await Farmer.findById(
                    req.session.farmer
                );

            const match =
                await bcrypt.compare(
                    oldPassword,
                    farmer.password
                );

            if (!match) {

                return res.send(
                    "Old Password Incorrect"
                );

            }

            const hashed =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            await Farmer.findByIdAndUpdate(

                farmer._id,

                {
                    password:
                        hashed
                }

            );

            res.redirect(
                "/farmerdashboardmenu"
            );

        }

        catch (err) {

            console.log(err);

            res.send(
                "Password Update Failed"
            );

        }

    }
);
/* ========================================================
   WEB SOCKET SERVER FOR REAL TIME COMMUNICATION
   ======================================================== */
io.on("connection", (socket) => {
  console.log("Client Connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client Disconnected:", socket.id);
  });
});

/* Server Initialization */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});