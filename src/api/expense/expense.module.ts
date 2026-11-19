import { Module } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from 'src/core/entity/expense.entity';
import { Income } from 'src/core/entity/income.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, Income])],
  controllers: [ExpenseController],
  providers: [ExpenseService],
})
export class ExpenseModule {}
