const db = require('../../models');
const { Op, Sequelize } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths } = require('date-fns');

const Project = db.Project;
const Client = db.Client;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;
const Expense = db.Expense;
const Platform = db.Platform;
const ForecastEntry = db.ForecastEntry; // Importar ForecastEntry

/**
 * Função auxiliar que calcula o valor recebido em um determinado período.
 */
async function calculateReceivedInPeriod(userId, startDate, endDate) {
    const result = await Transaction.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalReceived']
        ],
        include: [{
            model: Project,
            attributes: [], // Não precisa dos dados do projeto, apenas para o join
            where: { ownerId: userId } // Garante que estamos somando apenas de projetos do usuário
        }],
        where: {
            paymentDate: {
                [Op.between]: [startDate, endDate]
            }
        },
        raw: true
    });
    return parseFloat(result.totalReceived) || 0;
}

/**
 * Função auxiliar que calcula o total de despesas em um período.
 */
async function calculateExpensesInPeriod(userId, startDate, endDate) {
    const result = await Expense.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalExpenses']
        ],
        where: {
            userId: userId,
            expenseDate: {
                [Op.between]: [startDate, endDate]
            }
        },
        raw: true
    });
    return parseFloat(result.totalExpenses) || 0;
}

/**
 * Calcula as receitas/despesas previstas em um período.
 */
async function calculateForecastsInPeriod(userId, startDate, endDate, type) {
    const result = await ForecastEntry.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalAmount']
        ],
        where: {
            userId: userId,
            type: type,
            status: 'pending', // Apenas os pendentes
            dueDate: {
                [Op.between]: [startDate, endDate]
            }
        },
        raw: true
    });
    return parseFloat(result.totalAmount) || 0;
}


exports.getDashboardData = async (userId) => {
    // --- PASSO 1: OBTER IDs DE PROJETOS RELEVANTES ---
    const sharedProjectShares = await ProjectShare.findAll({
        where: { partnerId: userId },
        attributes: ['projectId']
    });
    const sharedProjectIds = sharedProjectShares.map(share => share.projectId);

    const mainWhereClause = {
        [Op.or]: [
            { ownerId: userId },
            { id: { [Op.in]: sharedProjectIds } }
        ]
    };

    // --- 2. CÁLCULO FINANCEIRO (Total e Falta a Receber) ---
    // Incluímos ProjectShare aqui para os cálculos robustos
    const allProjects = await Project.findAll({ 
        where: mainWhereClause,
        include: [{ model: ProjectShare, as: 'ProjectShares', attributes: ['commissionType', 'commissionValue', 'partnerId', 'amountPaid'] }]
    });
    
    let totalGrossBudget = 0;
    let totalReceivedByOwner = 0;
    let totalExpectedByOwner = 0;

    for (const project of allProjects) {
        const budget = parseFloat(project.budget || 0);
        const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
        const platformFee = budget * (platformCommissionPercent / 100);

        totalGrossBudget += budget;

        let ownerNetAfterPlatform = budget - platformFee;
        let partnersTotalCommissions = 0;

        // Soma as comissões de todos os parceiros para o cálculo do dono
        if (project.ProjectShares && project.ProjectShares.length > 0) {
            for (const share of project.ProjectShares) {
                const partnerExpectedAmount = share.commissionType === 'percentage'
                    ? ownerNetAfterPlatform * (parseFloat(share.commissionValue) / 100)
                    : parseFloat(share.commissionValue);
                partnersTotalCommissions += partnerExpectedAmount;
            }
        }
        
        // Lucro líquido esperado para o dono (total do projeto - plataforma - comissões dos parceiros)
        const currentProjectOwnerExpectedProfit = ownerNetAfterPlatform - partnersTotalCommissions;

        totalExpectedByOwner += currentProjectOwnerExpectedProfit;
        totalReceivedByOwner += parseFloat(project.paymentDetails?.owner?.amountReceived || 0);
    }

    const remainingToReceive = totalExpectedByOwner - totalReceivedByOwner;


    // --- 3. LUCRO LÍQUIDO DO MÊS ATUAL ---
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    
    const netReceivedInMonth = await calculateReceivedInPeriod(userId, currentMonthStart, currentMonthEnd); // Usa endOfMonth
    const totalExpensesMonth = await calculateExpensesInPeriod(userId, currentMonthStart, currentMonthEnd); // Usa endOfMonth
    const netProfitAfterExpenses = netReceivedInMonth - totalExpensesMonth;


    // --- 4. LISTA DE PROJETOS ATIVOS ---
    const activeProjectsList = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: { [Op.in]: ['in_progress', 'paused'] }
        },
        order: [['createdAt', 'DESC']],
        limit: 10,
        attributes: ['id', 'name']
    });

    // --- 5. PRÓXIMOS PRAZOS ---
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const upcomingDeadlines = await Project.findAll({
        where: {
            ownerId: userId, // Apenas projetos próprios para prazos
            status: { [Op.in]: ['in_progress', 'paused'] },
            deadline: { [Op.between]: [now, sevenDaysFromNow] }
        },
        order: [['deadline', 'ASC']],
        limit: 5,
        attributes: ['id', 'name', 'deadline']
    });

    // --- 6. PROJETOS CONCLUÍDOS RECENTEMENTE ---
    const recentCompletedProjectsData = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: 'completed'
        },
        include: [
            { model: Client, attributes: ['legalName', 'tradeName'] },
            { model: db.User, as: 'Partners', through: { model: ProjectShare, as: 'ProjectShare', attributes: ['commissionType', 'commissionValue'] } },
            { model: Platform, as: 'AssociatedPlatform', attributes: ['id', 'name', 'logoUrl'] }
        ],
        order: [['updatedAt', 'DESC']],
        limit: 5,
    });
    
    const recentCompletedProjects = recentCompletedProjectsData.map(project => {
        const budget = parseFloat(project.budget || 0);
        const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
        const platformFee = budget * (platformCommissionPercent / 100);
        
        let profit = budget - platformFee;

        if (project.Partners && project.Partners.length > 0) {
            for (const partner of project.Partners) {
                const share = partner.ProjectShare;
                const partnerExpectedAmount = share.commissionType === 'percentage'
                    ? budget * (parseFloat(share.commissionValue) / 100)
                    : parseFloat(share.commissionValue);
                profit -= partnerExpectedAmount;
            }
        }

        const userAsPartner = project.Partners?.find(p => p.id === userId);
        if (userAsPartner) {
            const partnerShare = userAsPartner.ProjectShare;
            if (partnerShare.commissionType === 'percentage') {
                profit = budget * (parseFloat(partnerShare.commissionValue) / 100);
            } else if (partnerShare.commissionType === 'fixed') {
                profit = parseFloat(partnerShare.commissionValue);
            }
        }
        
        return { 
            id: project.id, 
            name: project.name, 
            client: project.Client ? (project.Client.tradeName || project.Client.legalName) : 'N/A',
            profit: profit,
            platformName: project.AssociatedPlatform?.name || 'Venda Direta' 
        };
    });


    // --- 7. DADOS PARA O GRÁFICO ---
    const profitChartData = [];
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i);
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        
        const totalReceivedInMonth = await calculateReceivedInPeriod(userId, monthStart, monthEnd);
        const totalExpensesInMonth = await calculateExpensesInPeriod(userId, monthStart, monthEnd);
        
        profitChartData.push({ name: monthName, lucro: totalReceivedInMonth - totalExpensesInMonth });
    }

    return {
        netProfitMonth: netProfitAfterExpenses,
        totalGrossBudget: totalGrossBudget,
        totalToReceive: totalExpectedByOwner,
        remainingToReceive: remainingToReceive,
        activeProjects: activeProjectsList,
        upcomingDeadlines,
        recentCompletedProjects,
        profitChartData,
        totalExpensesMonth: totalExpensesMonth,
        forecastRevenueMonth: 0, // Temporariamente 0, será preenchido se o frontend precisar
        forecastExpenseMonth: 0  // Temporariamente 0, será preenchido se o frontend precisar
    };
};