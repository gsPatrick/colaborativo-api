const db = require('../../models');
const { Op } = require('sequelize');
const TimeEntry = db.TimeEntry;
const Project = db.Project;

/**
 * Inicia um novo timer para um projeto.
 * Garante que o usuário não tenha outro timer rodando.
 */
exports.startNewTimer = async (userId, projectId, description) => {
    // 1. Verifica se o usuário tem acesso ao projeto
    const project = await Project.findByPk(projectId);
    if (!project || project.ownerId !== userId) { // Simplificado: apenas o dono pode registrar horas
        throw new Error("Projeto não encontrado ou acesso negado.");
    }

    // 2. Validação CRÍTICA: Verifica se já existe um timer rodando para este usuário
    const runningTimer = await TimeEntry.findOne({
        where: {
            userId: userId,
            endTime: { [Op.is]: null } // Procura por uma entrada onde o tempo final é nulo
        }
    });
    if (runningTimer) {
        throw new Error("Você já possui um timer em andamento. Pare o timer atual antes de iniciar um novo.");
    }

    // 3. Cria o novo registro de tempo
    const newTimeEntry = await TimeEntry.create({
        userId,
        projectId,
        description,
        startTime: new Date()
    });

    return newTimeEntry;
};

/**
 * Para um timer que está em andamento.
 */
exports.stopRunningTimer = async (timeEntryId, userId) => {
    const timeEntry = await TimeEntry.findByPk(timeEntryId);

    if (!timeEntry) {
        throw new Error("Registro de tempo não encontrado.");
    }
    if (timeEntry.userId !== userId) {
        throw new Error("Acesso negado. Este registro de tempo não pertence a você.");
    }
    if (timeEntry.endTime !== null) {
        throw new Error("Este timer já foi parado.");
    }

    const endTime = new Date();
    const startTime = new Date(timeEntry.startTime);
    // Calcula a diferença em milissegundos e converte para minutos
    const durationInMinutes = Math.round((endTime - startTime) / 60000);

    timeEntry.endTime = endTime;
    timeEntry.durationInMinutes = durationInMinutes;
    
    await timeEntry.save();
    return timeEntry;
};

/**
 * Lista todos os registros de tempo de um projeto.
 */
exports.findAllEntriesByProject = async (projectId, userId) => {
    // Valida o acesso ao projeto
    const project = await Project.findByPk(projectId);
    if (!project || project.ownerId !== userId) {
        throw new Error("Projeto não encontrado ou acesso negado.");
    }

    return TimeEntry.findAll({
        where: { projectId },
        order: [['startTime', 'DESC']]
    });
};

/**
 * Deleta um registro de tempo específico.
 */
exports.deleteTimeEntry = async (timeEntryId, userId) => {
    const timeEntry = await TimeEntry.findByPk(timeEntryId);
    if (!timeEntry) {
        throw new Error("Registro de tempo não encontrado.");
    }
    if (timeEntry.userId !== userId) {
        throw new Error("Acesso negado.");
    }

    await timeEntry.destroy();
    return { message: "Registro de tempo deletado com sucesso." };
};