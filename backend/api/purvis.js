export default function handler(req, res) {
  if (req.method === 'GET') {
    const { module } = req.query;

    if (module === 'core') {
      return res.status(200).json({
        success: true,
        module: 'core',
        result: 'Core system active'
      });
    }

    if (module === 'test') {
      return res.status(200).json({
        success: true,
        module: 'test',
        result: 'Test module executed'
      });
    }

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
