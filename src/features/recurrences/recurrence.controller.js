const recurrenceService = require('./recurrence.service');

// --- Recorrências (CRUD) ---
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const recurrence = await recurrenceService.createRecurrence(userId, req.body);
    res.status(201).json(recurrence);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar recorrência", error: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const recurrences = await recurrenceService.findAllRecurrences(userId, req.query);
    res.status(200).json(recurrences);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar recorrências", error: error.message });
  }
};

exports.findOne = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const recurrence = await recurrenceService.findRecurrenceById(id, userId);
    res.status(200).json(recurrence);
  } catch (error) {
    res.status(404).json({ message: "Recorrência não encontrada", error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const recurrence = await recurrenceService.updateRecurrence(id, userId, req.body);
    res.status(200).json(recurrence);
  } catch (error) {
    res.status(400).json({ message: "Erro ao atualizar recorrência", error: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    await recurrenceService.deleteRecurrence(id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: "Erro ao deletar recorrência", error: error.message });
  }
};

// --- Lançamentos Previstos (Forecast Entries) ---
exports.findAllForecastEntries = async (req, res) => {
  try {
    const userId = req.user.id;
    const entries = await recurrenceService.findAllForecastEntries(userId, req.query);
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar lançamentos previstos", error: error.message });
  }
};

exports.confirmForecastEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const confirmedEntry = await recurrenceService.confirmForecastEntry(id, userId);
    res.status(200).json(confirmedEntry);
  } catch (error) {
    res.status(400).json({ message: "Erro ao confirmar lançamento", error: error.message });
  }
};