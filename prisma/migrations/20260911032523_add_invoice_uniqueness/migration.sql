/*
  Warnings:

  - A unique constraint covering the columns `[studentId,feeStructureId]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "invoices_studentId_feeStructureId_key" ON "invoices"("studentId", "feeStructureId");
