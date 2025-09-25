const db = require('../../models');
const { Op } = require('sequelize');
const { addMonths, addYears, isBefore, format, startOfDay, endOfDay, startOfMonth, endOfMonth, parseISO } = require('date-fns');

const Recurrence = db.Recurrence;
const ForecastEntry = db.ForecastEntry;
const Transaction = db.Transaction;
const Expense = db.Expense;
const Project = db.Project;
const Client = db.Client;


/**
 * Função auxiliar: Gera lançamentos previstos para uma recorrência.
 * Esta função é idempotent: se for chamada várias vezes, não duplica lançamentos futuros.
 */
async function generateForecastEntries(recurrence, transaction = null) {
    const now = startOfDay(new Date());
    const { id: recurrenceId, userId, clientId, projectId, type, description, amount, frequency, startDate, endDate } = recurrence;

    let currentDueDate = startOfDay(new Date(startDate));
    const finalEndDate = endDate ? startOfDay(new Date(endDate)) : null;
    
    // Deleta lançamentos FUTUROS pendentes existentes para evitar duplicatas em caso de update
    // e também para refletir mudanças na recorrência (ex: data de início, frequência)
    await ForecastEntry.destroy({
        where: {
            recurrenceId,
            dueDate: { [Op.gte]: now }, // Apenas a partir de hoje
            status: 'pending' // Apenas os pendentes (não confirmados/perdidos)
        },
        transaction
    });

    const entriesToCreate = [];
    const maxFutureEntries = 60; // Limite para 5 anos de entradas futuras para não sobrecarregar
    let count = 0;

    // Loop para gerar as entradas futuras
    while ((!finalEndDate || !isBefore(finalEndDate, currentDueDate)) && count < maxFutureEntries) {
        // Apenas cria entradas para o futuro ou para hoje (se for o caso)
        if (isBefore(now, currentDueDate) || format(now, 'yyyy-MM-dd') === format(currentDueDate, 'yyyy-MM-dd')) {
             entriesToCreate.push({
                userId,
                recurrenceId,
                clientId,
                projectId,
                type,
                description,
                amount,
                dueDate: currentDueDate
            });
        }
       
        // Avança para a próxima data de vencimento
        if (frequency === 'monthly') currentDueDate = addMonths(currentDueDate, 1);
        else if (frequency === 'quarterly') currentDueDate = addMonths(currentDueDate, 3);
        else if (frequency === 'annually') currentDueDate = addYears(currentDueDate, 1);
        else break; // Sai do loop se a frequência for inválida

        count++;
    }
    await ForecastEntry.bulkCreate(entriesToCreate, { transaction });
}


// --- Recorrências (CRUD) ---
exports.createRecurrence = async (userId, data) => {
    const t = await db.sequelize.transaction();
    try {
        const recurrence = await Recurrence.create({ ...data, userId }, { transaction: t });
        await generateForecastEntries(recurrence, t); // Gera os lançamentos previstos
        await t.commit();
        return recurrence;
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

exports.findAllRecurrences = async (userId, filters) => {
    const whereClause = { userId };
    if (filters.type) whereClause.type = filters.type;
    return Recurrence.findAll({
        where: whereClause,
        include: [{ model: Client }, { model: Project }],
        order: [['description', 'ASC']]
    });
};

exports.findRecurrenceById = async (id, userId) => {
    const recurrence = await Recurrence.findByPk(id, { include: [Client, Project] });
    if (!recurrence || recurrence.userId !== userId) {
        throw new Error("Recorrência não encontrada ou acesso negado.");
    }
    return recurrence;
};

exports.updateRecurrence = async (id, userId, data) => {
    const t = await db.sequelize.transaction();
    try {
        const recurrence = await exports.findRecurrenceById(id, userId); // Já verifica acesso
        await recurrence.update(data, { transaction: t });
        await generateForecastEntries(recurrence, t); // Regenera as entradas previstas
        await t.commit();
        return recurrence;
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

exports.deleteRecurrence = async (id, userId) => {
    const t = await db.sequelize.transaction();
    try {
        const recurrence = await exports.findRecurrenceById(id, userId); // Já verifica acesso
        await ForecastEntry.destroy({ where: { recurrenceId: id }, transaction: t }); // Deleta os previstos
        await recurrence.destroy({ transaction: t });
        await t.commit();
        return { message: "Recorrência deletada." };
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

// --- Lançamentos Previstos (Forecast Entries) ---
/**
 * Lista todos os lançamentos previstos para um usuário, com filtros.
 * Retorna uma lista de lançamentos e um sumário financeiro para os itens filtrados.
 */
exports.findAllForecastEntries = async (userId, filters) => {
    const { type, status, clientId, projectId, year, month } = filters;
    const now = new Date();

    let effectiveStartDate;
    let effectiveEndDate;

    // Lógica de filtro por mês/ano específico
    if (year && month) {
        const targetDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1); // month é 0-indexed no JS
        effectiveStartDate = startOfMonth(targetDate);
        effectiveEndDate = endOfMonth(targetDate);
    } else { // Por padrão, busca a partir de hoje
        effectiveStartDate = startOfDay(now);
        // Não define effectiveEndDate aqui se datePeriod não for fornecido, para buscar o futuro
    }

    const whereClause = { userId };
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (clientId) whereClause.clientId = clientId;
    if (projectId) whereClause.projectId = projectId;

    if (effectiveStartDate && effectiveEndDate) { // Se um período fechado foi definido
        whereClause.dueDate = { [Op.between]: [effectiveStartDate, effectiveEndDate] };
    } else if (effectiveStartDate) { // Se apenas uma data de início foi definida (busca a partir dela)
        whereClause.dueDate = { [Op.gte]: effectiveStartDate };
    } else if (effectiveEndDate) { // Se apenas uma data de fim foi definida (busca até ela)
        whereClause.dueDate = { [Op.lte]: effectiveEndDate };
    }
    // Se nenhum filtro de data foi aplicado (year/month ou startDate/endDate), o default é buscar tudo a partir de hoje.
    // Isso é importante para a "visão geral" dos lançamentos futuros.

    const entries = await ForecastEntry.findAll({
        where: whereClause,
        include: [{ model: Recurrence }, { model: Client }, { model: Project }],
        order: [['dueDate', 'ASC']]
    });

    // Calcula o sumário financeiro dos lançamentos previstos PARA O PERÍODO FILTRADO
    const summary = entries.reduce((acc, entry) => {
        const amount = parseFloat(entry.amount);
        acc.totalBruto += amount;
        if (entry.type === 'revenue') {
            acc.totalRevenue += amount;
        } else {
            acc.totalExpense += amount;
        }
        return acc;
    }, { totalBruto: 0, totalRevenue: 0, totalExpense: 0 });

    summary.totalLiquido = summary.totalRevenue - summary.totalExpense;

    return { entries, summary };
};


/**
 * Confirma um lançamento previsto, transformando-o em uma transação ou despesa real.
 */
exports.confirmForecastEntry = async (forecastEntryId, userId) => {
    const t = await db.sequelize.transaction();
    try {
        const entry = await ForecastEntry.findByPk(forecastEntryId);
        if (!entry || entry.userId !== userId) {
            throw new Error("Lançamento previsto não encontrado ou acesso negado.");
        }
        if (entry.status !== 'pending') {
            throw new Error("Lançamento já confirmado ou marcado como perdido.");
        }

        if (entry.type === 'revenue') {
            await Transaction.create({
                userId,
                projectId: entry.projectId,
                amount: entry.amount,
                paymentDate: new Date(),
                description: `Receita Recorrente: ${entry.description}`,
                forecastEntryId: entry.id
            }, { transaction: t });

        } else { // type === 'expense'
            await Expense.create({
                userId,
                projectId: entry.projectId,
                description: `Despesa Recorrente: ${entry.description}`,
                amount: entry.amount,
                expenseDate: new Date(),
                category: "Recorrência", // Categoria padrão para despesas recorrentes
                forecastEntryId: entry.id
            }, { transaction: t });
        }

        entry.status = 'confirmed';
        await entry.save({ transaction: t });

        await t.commit();
        return entry;
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

/**
 * Lógica para o cronjob que marca entradas como 'missed' (perdidas).
 * Isto deve ser executado periodicamente (ex: uma vez por dia).
 */
exports.markMissedForecastEntries = async () => {
    const now = startOfDay(new Date());
    await ForecastEntry.update(
        { status: 'missed' },
        {
            where: {
                dueDate: { [Op.lt]: now }, // Se a data de vencimento é anterior a hoje
                status: 'pending' // E ainda está pendente
            }
        }
    );
};

/**
 * Chamada inicial para gerar lançamentos previstos para recorrências existentes.
 * Isto deve ser chamado uma vez na inicialização da API (ex: no app.js) para popular o ForecastEntry.
 */
exports.generateInitialForecasts = async () => {
    console.log('Verificando recorrências para gerar lançamentos previstos...');
    const recurrences = await Recurrence.findAll();
    for (const rec of recurrences) {
        // Apenas gera se a recorrência ainda tiver lançamentos futuros a serem criados
        await generateForecastEntries(rec);
    }
    console.log('Geração inicial de lançamentos previstos concluída.');
};