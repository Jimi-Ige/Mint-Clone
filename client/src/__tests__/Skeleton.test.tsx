import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Skeleton,
  SkeletonCard,
  SkeletonRow,
  SkeletonChart,
  DashboardSkeleton,
  TransactionsSkeleton,
  ListPageSkeleton,
} from '../components/ui/Skeleton';

describe('Skeleton components', () => {
  it('should render Skeleton with custom class', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse', 'bg-gray-200', 'rounded', 'h-4', 'w-32');
  });

  it('should render Skeleton with custom style', () => {
    const { container } = render(<Skeleton style={{ height: '50%' }} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe('50%');
  });

  it('should render SkeletonCard', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toHaveClass('card');
  });

  it('should render SkeletonRow with avatar, text, and amount placeholders', () => {
    const { container } = render(<SkeletonRow />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(3);
  });

  it('should render SkeletonChart with bars', () => {
    const { container } = render(<SkeletonChart />);
    expect(container.firstChild).toHaveClass('card');
    // Should have multiple bar elements
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars.length).toBeGreaterThanOrEqual(8);
  });

  it('should render DashboardSkeleton with KPI cards and charts', () => {
    const { container } = render(<DashboardSkeleton />);
    // Should have multiple card sections
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it('should render TransactionsSkeleton', () => {
    const { container } = render(<TransactionsSkeleton />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('should render ListPageSkeleton with grid cards', () => {
    const { container } = render(<ListPageSkeleton />);
    const cards = container.querySelectorAll('.card');
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });
});
