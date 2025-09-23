const dashboardService = require('./dashboard.service');

// Obter os dados consolidados do dashboard
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    // Os filtros (ex: ?period=week) virão da query string
    const filters = req.query; 

    const dashboardData = await dashboardService.getDashboardData(userId, filters);
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao buscar dados do dashboard", error: error.message });
  }
};