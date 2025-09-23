const db = require('../../models');
const { Op, Sequelize } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths } = require('date-fns');

const Project = db.Project;
const Client = db.Client;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;

/**
 * Lógica de cálculo de lucro baseada em transações.
 */
async function calculateReceivedInPeriod(userId, startDate, endDate) {
    const result = await Transaction.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalReceived']
        ],
        include: [{
            model: Project,
            attributes: [],
            where: { ownerId: userId }
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

    // --- 2. CÁLCULO FINANCEIRO (Total e Falta a Receber) ---
    const allProjects = await Project.findAll({ where: mainWhereClause });
    
    let totalBudget = 0;
    let totalPaid = 0;
    allProjects.forEach(p => {
        totalBudget += parseFloat(p.budget || 0);
        totalPaid += parseFloat(p.paymentDetails.clientAmountPaid || 0);
    });
    const remainingToReceive = totalBudget - totalPaid;

    // --- 3. LUCRO LÍQUIDO DO MÊS ATUAL ---
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const netProfitMonth = await calculateReceivedInPeriod(userId, currentMonthStart, now);

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
            ownerId: userId,
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
        include: [{ 
            model: Client, 
            attributes: ['legalName', 'tradeName'] // CORRIGIDO
        }],
        order: [['updatedAt', 'DESC']],
        limit: 5,
    });
    
    const recentCompletedProjects = recentCompletedProjectsData.map(project => {
        const budget = parseFloat(project.budget || 0);
        const platformCommission = parseFloat(project.platformCommission || 0);
        const profit = budget - platformCommission;
        return { 
            id: project.id, 
            name: project.name, 
            client: project.Client ? (project.Client.tradeName || project.Client.legalName) : 'N/A', // CORRIGIDO
            profit: profit 
        };
    });

    // --- 7. DADOS PARA O GRÁFICO ---
    const profitChartData = [];
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i);
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        
        const totalReceived = await calculateReceivedInPeriod(userId, monthStart, monthEnd);
        profitChartData.push({ name: monthName, lucro: totalReceived });
    }

    return {
        netProfitMonth,
        totalToReceive: totalBudget,
        remainingToReceive,
        activeProjects: activeProjectsList,
        upcomingDeadlines,
        recentCompletedProjects,
        profitChartData
    };
};