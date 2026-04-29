export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: "Purvis backend running",
      status: "connected"
    });
  }

  return res.status(405).json({
    success: false,
    message: "Method not allowed"
  });
}
