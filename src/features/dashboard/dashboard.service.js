const db = require('../../models');
const { Op, Sequelize } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths, startOfDay } = require('date-fns');

const Project = db.Project;
const Client = db.Client;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;
const Expense = db.Expense;
const Platform = db.Platform;
const ForecastEntry = db.ForecastEntry; // Importar ForecastEntry
const User = db.User; // <-- CORREÇÃO AQUI: Importar o modelo User


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
            attributes: [],
            where: { ownerId: userId } // Filtra por projetos do dono
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
 * Função auxiliar para calcular os valores financeiros para um projeto específico
 * COM BASE NO USUÁRIO LOGADO (dono ou parceiro).
 * Esta função deve ser idêntica à do project.service.js para consistência.
 */
const calculateProjectFinancialsForUser = (projectInstance, currentUserId) => {
    const project = projectInstance.get({ plain: true });

    const budget = parseFloat(project.budget || 0);
    const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
    const platformFee = budget * (platformCommissionPercent / 100);

    let netAmountAfterPlatform = budget - platformFee;
    let totalPartnersCommissionsValue = 0; 

    project.ProjectShares?.forEach(share => {
        const partnerExpectedAmount = share.commissionType === 'percentage'
            ? netAmountAfterPlatform * (parseFloat(share.commissionValue) / 100)
            : parseFloat(share.commissionValue);
        totalPartnersCommissionsValue += partnerExpectedAmount;
    });

    const ownerExpectedProfit = netAmountAfterPlatform - totalPartnersCommissionsValue;

    let yourTotalToReceive = 0;
    let yourAmountReceived = 0;
    
    if (project.ownerId === currentUserId) {
        yourTotalToReceive = ownerExpectedProfit;
        yourAmountReceived = parseFloat(project.paymentDetails?.owner?.amountReceived || 0);
    } else {
        const userAsPartner = project.Partners?.find(p => p.id === currentUserId);
        if (userAsPartner) {
            const partnerShare = project.ProjectShares?.find(ps => ps.partnerId === currentUserId);
            if (partnerShare) {
                if (partnerShare.commissionType === 'percentage') {
                    yourTotalToReceive = netAmountAfterPlatform * (parseFloat(partnerShare.commissionValue) / 100);
                } else if (partnerShare.commissionType === 'fixed') {
                    yourTotalToReceive = parseFloat(partnerShare.commissionValue);
                }
                yourAmountReceived = parseFloat(partnerShare.amountPaid || 0);
            }
        }
    }
    const yourRemainingToReceive = yourTotalToReceive - yourAmountReceived;

    return {
        yourTotalToReceive: yourTotalToReceive,
        yourAmountReceived: yourAmountReceived,
        yourRemainingToReceive: yourRemainingToReceive,
        platformFee: platformFee,
        netAmountAfterPlatform: netAmountAfterPlatform,
        partnersCommissionsList: project.Partners?.map(partner => {
            const share = project.ProjectShares?.find(ps => ps.partnerId === partner.id);
            const partnerExpectedAmount = share.commissionType === 'percentage'
                ? netAmountAfterPlatform * (parseFloat(share.commissionValue) / 100)
                : parseFloat(share.commissionValue);
            return {
                id: partner.id,
                name: partner.name,
                expectedAmount: partnerExpectedAmount,
                shareDetails: share
            };
        }) || []
    };
};


/**
 * Calcula os dados consolidados do dashboard para o usuário.
 */
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

    // --- 2. CÁLCULO FINANCEIRO (Total Bruto, Seu Líquido Total, Seu Líquido Restante) ---
    const allProjectsInstances = await Project.findAll({
        where: mainWhereClause,
        include: [
            { model: User, as: 'Partners', through: { model: ProjectShare, as: 'ProjectShare', attributes: ['commissionType', 'commissionValue', 'paymentStatus', 'amountPaid'] } },
            { model: ProjectShare, as: 'ProjectShares', attributes: ['commissionType', 'commissionValue', 'paymentStatus', 'amountPaid'] }
        ]
    });

    let totalGrossBudget = 0;
    let totalYourExpectedToReceive = 0; // Sumário do seu líquido total esperado
    let totalYourAmountReceived = 0;    // Sumário do seu líquido já recebido

    // Calcula os financials para CADA projeto e soma nos totais do dashboard
    const projectsWithFinancials = allProjectsInstances.map(project => {
        const financials = calculateProjectFinancialsForUser(project, userId);
        totalGrossBudget += parseFloat(project.budget || 0);
        totalYourExpectedToReceive += parseFloat(financials.yourTotalToReceive);
        totalYourAmountReceived += parseFloat(financials.yourAmountReceived);
        return { ...project.get({ plain: true }), ...financials };
    });
    
    const remainingToReceive = totalYourExpectedToReceive - totalYourAmountReceived;


    // --- 3. LUCRO LÍQUIDO DO MÊS ATUAL (Receitas - Despesas) ---
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now); // Fim do mês para calcular previstos
    
    const netReceivedInMonth = await calculateReceivedInPeriod(userId, currentMonthStart, now);
    const totalExpensesMonth = await calculateExpensesInPeriod(userId, currentMonthStart, now);
    const netProfitAfterExpenses = netReceivedInMonth - totalExpensesMonth;


    // --- 4. LANÇAMENTOS PREVISTOS (RECEITAS/DESPESAS) PARA O MÊS ATUAL ---
    const forecastRevenueMonth = await calculateForecastsInPeriod(userId, currentMonthStart, currentMonthEnd, 'revenue');
    const forecastExpenseMonth = await calculateForecastsInPeriod(userId, currentMonthStart, currentMonthEnd, 'expense');


    // --- 5. LISTA DE PROJETOS ATIVOS ---
    const activeProjectsList = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: { [Op.in]: ['in_progress', 'paused'] }
        },
        order: [['createdAt', 'DESC']],
        limit: 10,
        attributes: ['id', 'name']
    });

    // --- 6. PRÓXIMOS PRAZOS ---
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const upcomingDeadlines = await Project.findAll({
        where: {
            ownerId: userId, // Apenas prazos de projetos que o usuário é dono
            status: { [Op.in]: ['in_progress', 'paused'] },
            deadline: { [Op.between]: [startOfDay(now), sevenDaysFromNow] } // A partir do início de hoje
        },
        order: [['deadline', 'ASC']],
        limit: 5,
        attributes: ['id', 'name', 'deadline']
    });

    // --- 7. PROJETOS CONCLUÍDOS RECENTEMENTE ---
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


    // --- 8. DADOS PARA O GRÁFICO (Lucro Mensal = Recebimento - Despesas) ---
    const profitChartData = [];
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i);
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        
        const totalReceivedInMonth = await calculateReceivedInPeriod(userId, monthStart, monthEnd);
        const totalExpensesInMonth = await calculateExpensesInPeriod(userId, monthStart, monthEnd); // Despesas do mês específico
        
        profitChartData.push({ name: monthName, lucro: totalReceivedInMonth - totalExpensesInMonth });
    }

    return {
        netProfitMonth: netProfitAfterExpenses,
        totalGrossBudget: totalGrossBudget,
        totalToReceive: totalYourExpectedToReceive, // Seu líquido total a receber
        remainingToReceive: remainingToReceive,     // Seu líquido que ainda não entrou
        activeProjects: activeProjectsList,
        upcomingDeadlines,
        recentCompletedProjects,
        profitChartData,
        totalExpensesMonth: totalExpensesMonth,
        forecastRevenueMonth: forecastRevenueMonth, // Previsão de receita do mês atual
        forecastExpenseMonth: forecastExpenseMonth  // Previsão de despesa do mês atual
    };
};