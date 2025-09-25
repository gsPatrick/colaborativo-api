const db = require('../../models');
const { Op } = require('sequelize');
const { addMonths, addYears, isBefore, format, startOfDay, endOfDay } = require('date-fns');

const Recurrence = db.Recurrence;
const ForecastEntry = db.ForecastEntry;
const Transaction = db.Transaction;
const Expense = db.Expense;
const Project = db.Project;
const Client = db.Client;


/**
 * Função auxiliar: Gera lançamentos previstos para uma recorrência.
 */
async function generateForecastEntries(recurrence, transaction = null) {
    const now = startOfDay(new Date());
    const { id: recurrenceId, userId, clientId, projectId, type, description, amount, frequency, startDate, endDate } = recurrence;

    let currentDueDate = startOfDay(new Date(startDate));
    const finalEndDate = endDate ? startOfDay(new Date(endDate)) : null;
    
    // Deleta lançamentos futuros pendentes existentes para evitar duplicatas em caso de update
    await ForecastEntry.destroy({
        where: {
            recurrenceId,
            dueDate: { [Op.gte]: now }, // Apenas a partir de hoje
            status: 'pending'
        },
        transaction
    });

    const entriesToCreate = [];
    while (!finalEndDate || !isBefore(finalEndDate, currentDueDate)) {
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
       
        if (frequency === 'monthly') currentDueDate = addMonths(currentDueDate, 1);
        else if (frequency === 'quarterly') currentDueDate = addMonths(currentDueDate, 3);
        else if (frequency === 'annually') currentDueDate = addYears(currentDueDate, 1);
        else break; // Para evitar loop infinito se a frequência for inválida

        // Limita a geração futura para evitar muitos registros (ex: 5 anos)
        if (entriesToCreate.length > 60) break; // 5 anos * 12 meses
    }
    await ForecastEntry.bulkCreate(entriesToCreate, { transaction });
}


// --- Recorrências (CRUD) ---
exports.createRecurrence = async (userId, data) => {
    const t = await db.sequelize.transaction();
    try {
        const recurrence = await Recurrence.create({ ...data, userId }, { transaction: t });
        await generateForecastEntries(recurrence, t);
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
exports.findAllForecastEntries = async (userId, filters) => {
    const { type, status, clientId, projectId, datePeriod = 'all', startDate, endDate } = filters;
    const now = new Date();
    let effectiveStartDate = startDate ? startOfDay(new Date(startDate)) : null;
    let effectiveEndDate = endDate ? endOfDay(new Date(endDate)) : null;

    // Lógica de filtro por período (ex: 'month', 'nextMonth')
    if (datePeriod === 'month') {
        effectiveStartDate = startOfMonth(now);
        effectiveEndDate = endOfMonth(now);
    } else if (datePeriod === 'nextMonth') {
        effectiveStartDate = startOfMonth(addMonths(now, 1));
        effectiveEndDate = endOfMonth(addMonths(now, 1));
    }
    // Adicione mais períodos conforme necessário ('next3Months', 'next6Months', etc.)

    const whereClause = { userId };
    if (type) whereClause.type = type;
    if (status) whereClause.status = status;
    if (clientId) whereClause.clientId = clientId;
    if (projectId) whereClause.projectId = projectId;

    if (effectiveStartDate && effectiveEndDate) {
        whereClause.dueDate = { [Op.between]: [effectiveStartDate, effectiveEndDate] };
    } else if (effectiveStartDate) {
        whereClause.dueDate = { [Op.gte]: effectiveStartDate };
    } else if (effectiveEndDate) {
        whereClause.dueDate = { [Op.lte]: effectiveEndDate };
    }
    // Por padrão, sempre mostra a partir de hoje se nenhum filtro de data explícito
    if (!effectiveStartDate && !effectiveEndDate && datePeriod === 'all') {
         whereClause.dueDate = { [Op.gte]: startOfDay(now) };
    }


    const entries = await ForecastEntry.findAll({
        where: whereClause,
        include: [{ model: Recurrence }, { model: Client }, { model: Project }],
        order: [['dueDate', 'ASC']]
    });

    // Calcula o sumário financeiro dos lançamentos previstos
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
            // Cria uma Transação real (pagamento do cliente)
            await Transaction.create({
                userId,
                projectId: entry.projectId,
                amount: entry.amount,
                paymentDate: new Date(),
                description: `Confirmado: ${entry.description}`,
                forecastEntryId: entry.id
            }, { transaction: t });
            // NOTA: O status do projeto será atualizado pelo hook da Transaction

        } else { // type === 'expense'
            // Cria uma Despesa real
            await Expense.create({
                userId,
                projectId: entry.projectId,
                description: `Confirmado: ${entry.description}`,
                amount: entry.amount,
                expenseDate: new Date(),
                category: "Recorrência", // Categoria padrão
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

// --- Lógica para o cronjob que marca entradas como 'missed' ---
// (Isso seria um cronjob externo ou um endpoint que roda periodicamente)
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

// --- Chamada inicial para gerar previstos para recorrências existentes ---
// Isso deve ser chamado uma vez na inicialização da API (ex: no app.js)
exports.generateInitialForecasts = async () => {
    console.log('Verificando recorrências para gerar lançamentos previstos...');
    const recurrences = await Recurrence.findAll();
    for (const rec of recurrences) {
        await generateForecastEntries(rec);
    }
    console.log('Geração inicial de lançamentos previstos concluída.');
};