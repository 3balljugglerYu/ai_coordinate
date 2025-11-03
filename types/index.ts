/**
 * 横断共有の型定義（最小限）
 * 機能固有の型は features/ 内に配置
 */

export type ID = string;

export interface BaseEntity {
  id: ID;
  createdAt: Date;
  updatedAt: Date;
}

