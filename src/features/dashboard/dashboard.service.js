const db = require('../../models');
const { Op, Sequelize } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths } = require('date-fns');

const Project = db.Project;
const Client = db.Client;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;
const Expense = db.Expense;

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
            where: { ownerId: userId } // Considera apenas transações de projetos que o usuário é DONO
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
 * Calcula o total de despesas em um período.
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


exports.getDashboardData = async (userId) => {
    // --- PASSO 1: OBTER IDS DE PROJETOS RELEVANTES ---
    // Busca os IDs de todos os projetos onde o usuário é dono ou parceiro
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

    // --- 2. CÁLCULO FINANCEIRO GERAL (VALOR BRUTO, A RECEBER, FALTA) ---
    const allProjects = await Project.findAll({ 
        where: mainWhereClause,
        include: [
            { model: ProjectShare, as: 'ProjectShares', attributes: ['partnerId', 'commissionType', 'commissionValue', 'paymentStatus', 'amountPaid'] },
            { model: db.Platform, as: 'AssociatedPlatform', attributes: ['name', 'defaultCommissionPercent'] }
        ]
    });
    
    let totalGrossBudget = 0; // Valor total do orçamento de TODOS os projetos (dono + parceiro)
    let totalExpectedOwnerAmount = 0; // O que o dono deve receber *líquido* dos seus projetos
    let totalReceivedOwnerAmount = 0; // O que o dono JÁ recebeu dos seus projetos (da paymentDetails.owner)
    let totalExpensesSum = 0; // Total de despesas (para o card de despesas do período)

    for (const project of allProjects) {
        const budget = parseFloat(project.budget || 0);
        const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
        const platformFee = budget * (platformCommissionPercent / 100);

        totalGrossBudget += budget; // Soma o orçamento total de cada projeto

        // --- CÁLCULO PARA O DONO DO PROJETO ---
        if (project.ownerId === userId) {
            let ownerNetAfterPlatform = budget - platformFee;
            let totalPartnersCommissions = 0;

            project.ProjectShares?.forEach(share => { // project.ProjectShares é a associação direta que criamos
                const partnerExpectedAmount = share.commissionType === 'percentage'
                    ? ownerNetAfterPlatform * (parseFloat(share.commissionValue) / 100)
                    : parseFloat(share.commissionValue);
                totalPartnersCommissions += partnerExpectedAmount;
            });

            // O lucro líquido esperado para o DONO (o que sobra depois de tudo)
            totalExpectedOwnerAmount += (ownerNetAfterPlatform - totalPartnersCommissions);
            totalReceivedOwnerAmount += parseFloat(project.paymentDetails?.owner?.amountReceived || 0);
        }
        // NOTA: Se o usuário logado for APENAS PARCEIRO em um projeto, o lucro dele é a comissão definida em ProjectShare.
        // Essa lógica mais granular para 'totalExpectedOwnerAmount' e 'totalReceivedOwnerAmount' é para o DONO.
        // Para incluir o parceiro, precisaríamos somar as 'amountPaid' de ProjectShare para o userId.
    }
    const remainingToReceive = totalExpectedOwnerAmount - totalReceivedOwnerAmount;


    // --- 3. LUCRO LÍQUIDO DO MÊS ATUAL ---
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const netReceivedInMonth = await calculateReceivedInPeriod(userId, currentMonthStart, now); // Valor recebido por transações (dono)
    totalExpensesSum = await calculateExpensesInPeriod(userId, currentMonthStart, now); // Despesas totais no mês

    const netProfitAfterExpenses = netReceivedInMonth - totalExpensesSum;


    // --- 4. LISTA DE PROJETOS ATIVOS ---
    const activeProjectsList = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: { [Op.in]: ['in_progress', 'paused', 'draft'] }
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
            ownerId: userId, // Prazos só fazem sentido para projetos que o usuário é DONO
            status: { [Op.in]: ['in_progress', 'paused', 'draft'] },
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
            { model: ProjectShare, as: 'ProjectShares', attributes: ['partnerId', 'commissionType', 'commissionValue'] }, // Inclui ProjectShares
            { model: db.Platform, as: 'AssociatedPlatform', attributes: ['name', 'defaultCommissionPercent'] }
        ],
        order: [['updatedAt', 'DESC']],
        limit: 5,
    });
    
    const recentCompletedProjects = recentCompletedProjectsData.map(project => {
        const budget = parseFloat(project.budget || 0);
        const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
        const platformFee = budget * (platformCommissionPercent / 100);
        
        let profit = budget - platformFee; // Lucro inicial: bruto - plataforma

        // Subtrai comissão de cada parceiro do lucro do dono
        project.ProjectShares?.forEach(share => {
            const partnerExpectedAmount = share.commissionType === 'percentage'
                ? budget * (parseFloat(share.commissionValue) / 100)
                : parseFloat(share.commissionValue);
            profit -= partnerExpectedAmount; // Subtrai do lucro do dono
        });

        // Se o usuário logado for um PARCEIRO, o lucro é a comissão dele
        const userAsPartnerShare = project.ProjectShares?.find(ps => ps.partnerId === userId); // Busca a ProjectShare do usuário logado
        if (userAsPartnerShare) {
            if (userAsPartnerShare.commissionType === 'percentage') {
                profit = budget * (parseFloat(userAsPartnerShare.commissionValue) / 100);
            } else if (userAsPartnerShare.commissionType === 'fixed') {
                profit = parseFloat(userAsPartnerShare.commissionValue);
            }
        }
        
        return { 
            id: project.id, 
            name: project.name, 
            client: project.Client ? (project.Client.tradeName || project.Client.legalName) : 'N/A',
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
        
        const totalReceivedInMonth = await calculateReceivedInPeriod(userId, monthStart, monthEnd);
        const totalExpensesInMonth = await calculateExpensesInPeriod(userId, monthStart, monthEnd);
        
        profitChartData.push({ name: monthName, lucro: totalReceivedInMonth - totalExpensesInMonth });
    }

    return {
        netProfitMonth: netProfitAfterExpenses, // Lucro líquido real (recebimentos - despesas do mês)
        totalGrossBudget: totalGrossBudget, // Valor bruto de todos os projetos (dono + parceiro)
        totalToReceive: totalExpectedOwnerAmount, // O que o DONO deve receber *líquido* (já descontado tudo)
        remainingToReceive: remainingToReceive, // O que o DONO ainda não recebeu (líquido)
        activeProjects: activeProjectsList,
        upcomingDeadlines,
        recentCompletedProjects,
        profitChartData,
        totalExpensesMonth: totalExpensesSum // Total de despesas no mês
    };
};