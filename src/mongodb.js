require("dotenv").config();

const mongoose = require("mongoose");

mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log("MongoDB Atlas Connected Successfully");
})
.catch((err) => {
    console.log("MongoDB Connection Error:", err);
});
/*counter schema for auto generating farmer id*/
const counterSchema = new mongoose.Schema({
    _id: String,
    seq: {
        type: Number,
        default: 0
    }
});
const Counter = mongoose.model("Counter", counterSchema);

/* ========================================================
   1. FARMER SCHEMA (రైతుల వివరాల స్కీమా)
   ======================================================== */
const farmerSchema = new mongoose.Schema(
{
    farmerId: {
        type: String,
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    village: {
        type: String,
        required: true,
        trim: true
    },
    preferredMilkType: {
        type: String,
        enum: ["Cow", "Buffalo", "Both"],
        default: "Both"
    },
    status: {
        type: String,
        enum: ["Active", "Inactive"],
        default: "Active"
    }
},
{
    timestamps: true
});
/*Add Pre-save Middleware to auto generate farmer id*/
farmerSchema.pre("save", async function () {
    if (!this.isNew || this.farmerId) {
        return;
    }

    const counter = await Counter.findByIdAndUpdate(
        "farmer",
        { $inc: { seq: 1 } },
        {
            returnDocument: "after",
            upsert: true
        }
    );

    this.farmerId =
        "FRM" + String(counter.seq).padStart(4, "0");
});


/* ========================================================
   2. COLLECTION AGENT SCHEMA (పాల కేంద్రం ఏజెంట్ స్కీమా)
   ======================================================== */
const collectionAgentSchema = new mongoose.Schema(
{
    agentId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    centerName: {
        type: String,
        required: true,
        trim: true
    },
    village: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ["Active", "Inactive"],
        default: "Active"
    }
},
{
    timestamps: true
});

/* ========================================================
   3. MILK COLLECTION SCHEMA (పాల సేకరణ రికార్డుల స్కీమా)
   ======================================================== */
const milkCollectionSchema = new mongoose.Schema({
    collectionAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CollectionAgent",
        required: true
    },
    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true
    },
    session: {
        type: String,
        enum: ["Morning", "Evening"],
        required: true
    },
    milkType: {
        type: String,
        enum: ["Cow", "Buffalo"],
        required: true
    },
    readingSource: {
        type: String,
        enum: ["Machine", "Manual"],
        default: "Machine",
        required: true
    },

    liters: {
        type: Number,
        required: true,
        min: 0
    },
    fat: {
        type: Number,
        required: true,
        min: 0
    },
    snf: {
        type: Number,
        required: true,
        min: 0
    },

    calcMethod: {
    type: String,
    enum: [
        "dynamicTS",
        "twoAxis",
        "fatBased"
    ],
    default: "fatBased"
},
    // TS Method rate used for THIS collection
    rate: {
    type: Number,
    default: 0,
    min: 0
},

fatPrice: {
    type: Number,
    default: 0,
    min: 0
},

snfPrice: {
    type: Number,
    default: 0,
    min: 0
},
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    advanceAdjusted: {
    type: Number,
    default: 0,
    min: 0
},
paidAmount: {
    type: Number,
    default: 0,
    min: 0
},balance: {
    type: Number,
    default: 0,
    min: 0
},


    collectionDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});
// pre-save middleware to calculate balance before saving the collection record//
  milkCollectionSchema.pre("save", function () {
    this.balance = Math.max(
        0,
        (this.totalAmount || 0) -
        (this.advanceAdjusted || 0) -
        (this.paidAmount || 0)
    );
});
const baseRateSchema = new mongoose.Schema({
    milkType: {
        type: String,
        enum: ["Cow", "Buffalo"],
        required: true,
        unique: true
    },

    // TS Method Rate
    tsRate: {
        type: Number,
        default: 0,
        min: 0
    },

    // Two-Axis Method Rates
    fatPrice: {
        type: Number,
        default: 0
    },
    snfPrice: {
        type: Number,
        default: 0
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});
/*fat based */
const fatRateSchema = new mongoose.Schema({
    milkType: {
        type: String,
        enum: ["Cow", "Buffalo"],
        required: true
    },

    fromFat: {
        type: Number,
        required: true,
        min: 0
    },

    toFat: {
        type: Number,
        required: true,
        min: 0
    },

    rate: {
        type: Number,
        required: true,
        min: 0
    },

    effectiveFrom: {
        type: Date,
        required: true,
        index: true
    }

}, {
    timestamps: true
});
/*to prevent duplicate slab of fat rate based*/
fatRateSchema.index(
    {
        milkType: 1,
        fromFat: 1,
        toFat: 1,
        effectiveFrom: 1
    },
    {
        unique: true
    }
);
/*payment schema*/
const paymentSchema = new mongoose.Schema({

    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true,
        unique: true
    },

    totalCollectionDays: {
        type: Number,
        default: 0
    },

    totalLiters: {
        type: Number,
        default: 0
    },

    totalMilkAmount: {
        type: Number,
        default: 0
    },

    advanceAmount: {
        type: Number,
        default: 0
    },

    bonusAmount: {
        type: Number,
        default: 0
    },

    deductionAmount: {
        type: Number,
        default: 0
    },

    netPayableAmount: {
        type: Number,
        default: 0
    },

    paidAmount: {
        type: Number,
        default: 0
    },

    balanceDue: {
        type: Number,
        default: 0
    },

    paymentStatus: {
        type: String,
        enum: [
            "Pending",
            "Partial",
            "Paid"
        ],
        default: "Pending"
    },

    lastPaymentType: {
        type: String,
        enum: [
            "Advance",
            "Settlement",
            "Bonus",
            "Deduction"
        ],
        default: "Settlement"
    },

    lastPaymentMethod: {
        type: String,
        enum: [
            "Cash",
            "UPI",
             "Bank Transfer",
            "Cheque"
        ],
        default: "Cash"
    },

    lastPaymentDate: {
        type: Date
    },

    remarks: {
        type: String,
        trim: true,
        default: ""
    },

    pdfGenerated: {
        type: Boolean,
        default: false
    },

    pdfGeneratedAt: {
        type: Date
    },

    whatsappSent: {
        type: Boolean,
        default: false
    },

    whatsappSentAt: {
        type: Date
    }

},
{
    timestamps: true
});
/*payment transactions*/

const paymentTransactionSchema = new mongoose.Schema({

    // Reference to Current Payment Summary
    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
        required: true
    },

    // Farmer
    farmerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Farmer",
        required: true
    },

    // Unique Transaction Number
    transactionNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    // Type of Payment
    paymentType: {
        type: String,
        enum: [
            "Advance",
            "Settlement",
            "Bonus",
            "Deduction"
        ],
        default: "Settlement"
    },

    // Paid Amount
    transactionAmount: {
        type: Number,
        required: true,
        min: 0
    },

    // Payment Method
    paymentMethod: {
        type: String,
        enum: [
            "Cash",
            "UPI",
            "Bank Transfer",
            "Cheque"
        ],
        required: true
    },

    // Payment Date
    paymentDate: {
        type: Date,
        default: Date.now
    },

    // Optional Remarks
    remarks: {
        type: String,
        trim: true,
        default: ""
    },

    // Optional Reference Number
    transactionReference: {
        type: String,
        trim: true,
        default: ""
    },

    // Payment Status After Transaction
    paymentStatus: {
    type: String,
    enum: ["Partial", "Paid"],
    default: "Paid"
},
    // Receipt Generated
    pdfGenerated: {
        type: Boolean,
        default: false
    },

    pdfGeneratedAt: {
        type: Date
    },

    // WhatsApp Receipt
    whatsappSent: {
        type: Boolean,
        default: false
    },

    whatsappSentAt: {
        type: Date
    }

}, {
    timestamps: true
});
// మోడల్స్ క్రియేషన్
const Farmer = mongoose.model("Farmer", farmerSchema);
const CollectionAgent = mongoose.model("CollectionAgent", collectionAgentSchema);
const MilkCollection = mongoose.model("MilkCollection", milkCollectionSchema);
const BaseRate = mongoose.model("BaseRate",baseRateSchema);
const FatRate =mongoose.model("FatRate",fatRateSchema);
const Payment = mongoose.model("Payment", paymentSchema);
const PaymentTransaction =mongoose.model("PaymentTransaction",paymentTransactionSchema);


// సర్వర్ ఫైల్ లో వాడుకోవడానికి ఎగుమతి చేయడం
module.exports = {Farmer,CollectionAgent,MilkCollection,BaseRate,FatRate, Payment,PaymentTransaction,Counter};
