import { Injectable } from '@nestjs/common';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { BaseService } from 'src/infrastructure/lib/baseService';
import { DataSource, DeepPartial } from 'typeorm';
import { Expense } from 'src/core/entity/expense.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ExpenseRepository } from 'src/core/repository/expense.repository';
import { Income } from 'src/core/entity/income.entity';
import { IncomeRepository } from 'src/core/repository/income.repository';

@Injectable()
export class ExpenseService extends BaseService<
  CreateExpenseDto,
  DeepPartial<Expense>
> {
  constructor(
    @InjectRepository(Expense) repository: ExpenseRepository,
    @InjectRepository(Income)
    private readonly dataSource: DataSource,
  ) {
    super(repository);
  }
  async statistics(userId: string) {
    return await this.dataSource.transaction(async (manager) => {
      const totalIncome = await manager
        .createQueryBuilder(Income, 'income')
        .select('COALESCE(SUM(income.price), 0)', 'total')
        .where('income.user_id = :userId', { userId })
        .andWhere(
          `DATE_TRUNC('month', income.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`,
        )
        .getRawOne();

      const totalExpense = await manager
        .createQueryBuilder(Expense, 'expense')
        .select('COALESCE(SUM(expense.price), 0)', 'total')
        .where('expense.user_id = :userId', { userId })
        .andWhere(
          `DATE_TRUNC('month', expense.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`,
        )
        .getRawOne();

      const todayIncomes = await manager
        .createQueryBuilder(Income, 'income')
        .where('income.user_id = :userId', { userId })
        .andWhere('DATE(income.created_at) = CURRENT_DATE')
        .getMany();

      const todayExpenses = await manager
        .createQueryBuilder(Expense, 'expense')
        .where('expense.user_id = :userId', { userId })
        .andWhere('DATE(expense.created_at) = CURRENT_DATE')
        .getMany();

      const todayTransactions = [
        ...todayIncomes.map((item) => ({ ...item, type: 'income' })),
        ...todayExpenses.map((item) => ({ ...item, type: 'expense' })),
      ];

      const expenseCategories = await manager
        .createQueryBuilder(Expense, 'expense')
        .leftJoin('expense.category', 'category')
        .select('category.name', 'categoryName')
        .addSelect("'expense'", 'type')
        .addSelect('COALESCE(SUM(expense.price), 0)', 'total')
        .where('expense.user_id = :userId', { userId })
        .andWhere(
          `DATE_TRUNC('month', expense.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`,
        )
        .groupBy('category.name')
        .getRawMany();

      const incomeCategories = await manager
        .createQueryBuilder(Income, 'income')
        .leftJoin('income.category', 'category')
        .select('category.name', 'categoryName')
        .addSelect("'income'", 'type')
        .addSelect('COALESCE(SUM(income.price), 0)', 'total')
        .where('income.user_id = :userId', { userId })
        .andWhere(
          `DATE_TRUNC('month', income.created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`,
        )
        .groupBy('category.name')
        .getRawMany();

      todayTransactions.sort((a, b) => {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      return {
        income: parseFloat(totalIncome.total),
        expense: parseFloat(totalExpense.total),
        todayTransactions,
        categorys: [...expenseCategories, ...incomeCategories],
      };
    });
  }
}
