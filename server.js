import express from "express";
import cors fromh "cors";

import { orchestrate } from "./core/orchestrator.js";
import { modules } from "./core/modules.js";

const app = express();
app.use(cors());
app.use(express.json());

const memory = {
  async getContext() {
    return {};
  },
  async save(data) {
    console.log("Memory saved:", data);
  }
};

app.post("/execute", async (req, res) => {
  const { input } = req.body;

  try {
    const result = await orchestrate(input, modules, memory);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log("PURVIS running on port 3000");
});
