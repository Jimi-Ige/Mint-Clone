import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from '../components/ui/EmptyState';
import { Target } from 'lucide-react';

describe('EmptyState', () => {
  it('should render title and description', () => {
    render(
      <EmptyState
        icon={Target}
        title="No items found"
        description="Start by adding your first item"
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
    expect(screen.getByText('Start by adding your first item')).toBeInTheDocument();
  });

  it('should render action button when provided', () => {
    render(
      <EmptyState
        icon={Target}
        title="Empty"
        description="Nothing here"
        action={<button>Add Item</button>}
      />
    );

    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('should not render action when not provided', () => {
    render(
      <EmptyState
        icon={Target}
        title="Empty"
        description="Nothing here"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
