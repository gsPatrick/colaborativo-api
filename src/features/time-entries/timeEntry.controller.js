const timeEntryService = require('./timeEntry.service');

/**
 * Controller para iniciar um novo timer.
 */
exports.startTimer = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const { description } = req.body;

    const timeEntry = await timeEntryService.startNewTimer(userId, projectId, description);
    res.status(201).json(timeEntry);
  } catch (error) {
    res.status(400).json({ message: "Erro ao iniciar timer", error: error.message });
  }
};

/**
 * Controller para parar um timer.
 */
exports.stopTimer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const timeEntry = await timeEntryService.stopRunningTimer(id, userId);
    res.status(200).json(timeEntry);
  } catch (error) {
    const statusCode = error.message.includes("negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao parar timer", error: error.message });
  }
};

/**
 * Controller para listar todos os registros de tempo de um projeto.
 */
exports.findAllByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const timeEntries = await timeEntryService.findAllEntriesByProject(projectId, userId);
    res.status(200).json(timeEntries);
  } catch (error) {
    const statusCode = error.message.includes("negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao buscar registros de tempo", error: error.message });
  }
};

/**
 * Controller para deletar um registro de tempo.
 */
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await timeEntryService.deleteTimeEntry(id, userId);
    res.status(204).send();
  } catch (error) {
    const statusCode = error.message.includes("negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar registro de tempo", error: error.message });
  }
};