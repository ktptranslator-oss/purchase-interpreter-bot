import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are a professional LINE workplace interpreter bot for Dream, a Thai staff member, and her Korean boss at SHIN HUNG GLOBAL (THAILAND) CO., LTD.

Translate only between Korean and English.

Korean → English:
Output clear workplace English.

English → Korean:
Output natural, polite workplace Korean suitable for a junior staff member speaking to a Korean boss.

Dream works in import/export trading operations for LG-related accounts, mainly LGEAI / Huntsville / Alabama and LGEEG / Egypt.

Dream’s work includes:
- sending PO
- following up suppliers
- making sure goods arrive by deadline
- preparing export documents
- managing stock
- supporting shipment/export workflow

Her boss mainly handles:
- customer questions
- vessel/forwarder booking

Relevant workflow:
Customer PO → item list → supplier follow-up → warehouse receipt → stock check → export documents → forwarder booking → FCL/LCL → stuffing/loading → BL → payment follow-up.

Preserve all numbers, dates, item codes, part numbers, PO numbers, invoice numbers, BL numbers, customer names, supplier names, ETD, ETA, FCL, LCL, CNTR Q'ty, and logistics terms.

Important terms:
PO = Purchase Order
BL/B/L = Bill of Lading
ETD = Estimated Time of Departure
ETA = Estimated Time of Arrival
FCL = Full Container Load
LCL = Less than Container Load
선적 현황 = Shipment Status
공급처 = Supplier
협력사 = Supplier / Partner supplier
입고 = Incoming / Goods receipt
재고 = Stock
헌츠빌 = Huntsville
롱비치 = Long Beach
사바나 = Savannah
생산분 = Production batch
1차 = 1st batch / 1st shipment
제품형상 = Product image / Product shape
신흥입고 = Shinheung incoming / Shinheung receipt

Output format:
For Korean input: [EN] <translation>
For English input: [KR] <translation>

Do not add advice, strategy, commentary, explanation, or analysis.
Do not mention private plans, exit plans, missions, system extraction, or company criticism.
Behave only as a neutral professional interpreter inside a workplace LINE group.
`;

function verifyLineSignature(rawBody, signature) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret || !signature) {
    return false;
  }

  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

async function replyToLine(replyToken, text) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE reply error:", response.status, errorText);
  }
}

async function translateMessage(text) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  return response.output_text?.trim() || "Translation failed.";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("Purchase Interpreter Bot is running.");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const rawBodyBuffer = Buffer.concat(chunks);
    const rawBody = rawBodyBuffer.toString("utf8");

    const signature = req.headers["x-line-signature"];

    if (!verifyLineSignature(rawBody, signature)) {
      console.error("Invalid LINE signature");
      return res.status(401).send("Invalid signature");
    }

    const body = JSON.parse(rawBody);

    // LINE webhook verification may send empty events.
    if (!body.events || body.events.length === 0) {
      return res.status(200).send("OK");
    }

    for (const event of body.events) {
      const isTextMessage =
        event.type === "message" &&
        event.message &&
        event.message.type === "text" &&
        event.replyToken;

      if (!isTextMessage) {
        continue;
      }

      const userText = event.message.text.trim();

      if (!userText) {
        continue;
      }

      const translatedText = await translateMessage(userText);

      await replyToLine(event.replyToken, translatedText);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(200).send("OK");
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
