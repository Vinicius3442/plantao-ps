// ============================================================================
// Teste Automatizado de Componente de Tela com Testing Library (Item 3.9)
// Testa o formulário de triagem (VitalSignsForm):
// - Sugestão automática de cor ao alterar sinais vitais
// - Obrigatoriedade de justificativa ao alterar manualmente a cor sugerida
// - Submissão com dados válidos
// ============================================================================

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VitalSignsForm } from '../components/VitalSignsForm';

describe('5. Componente de Tela: VitalSignsForm (Item 3.9)', () => {
  it('sugere automaticamente a cor VERMELHO quando a saturação é menor que 90% e envia os dados', async () => {
    const user = userEvent.setup();
    const onSubmitMock = vi.fn();

    render(<VitalSignsForm onSubmitTriage={onSubmitMock} />);

    const satInput = screen.getByLabelText(/Saturação O₂/i);
    await user.clear(satInput);
    await user.type(satInput, '85');

    const complaintInput = screen.getByLabelText(/Queixa Principal/i);
    await user.type(complaintInput, 'Falta de ar intensa e cianose');

    // Verifica se o badge de sugestão automática mudou para Vermelho / Emergência
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: /Risco Vermelho - Emergência/i })
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', {
      name: /Concluir Triagem e Enviar à Fila/i,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmitMock).toHaveBeenCalledTimes(1);
    });

    expect(onSubmitMock.mock.calls[0][0]).toMatchObject({
      oxygen_saturation: 85,
      suggested_color: 'vermelho',
      final_color: 'vermelho',
      chief_complaint: 'Falta de ar intensa e cianose',
    });
  });

  it('exige justificativa obrigatória quando o enfermeiro altera a cor sugerida pelo protocolo', async () => {
    const user = userEvent.setup();
    const onSubmitMock = vi.fn();

    render(<VitalSignsForm onSubmitTriage={onSubmitMock} />);

    // Preencher queixa válida (sinais vitais padrão sugerem AZUL)
    const complaintInput = screen.getByLabelText(/Queixa Principal/i);
    await user.type(complaintInput, 'Cefaleia intensa súbita');

    // Alterar manualmente a cor para LARANJA
    const laranjaOverrideBtn = screen.getByRole('button', { name: /^Laranja$/i });
    await user.click(laranjaOverrideBtn);

    // Tentar submeter sem preencher a justificativa
    const submitBtn = screen.getByRole('button', {
      name: /Concluir Triagem e Enviar à Fila/i,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Justificativa clínica obrigatória/i)
      ).toBeInTheDocument();
    });
    expect(onSubmitMock).not.toHaveBeenCalled();

    // Preencher a justificativa e submeter novamente
    const justificationInput = screen.getByPlaceholderText(
      /Informe a justificativa clínica/i
    );
    await user.type(justificationInput, 'Histórico prévio de aneurisma cerebral');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmitMock).toHaveBeenCalledTimes(1);
    });
    expect(onSubmitMock.mock.calls[0][0]).toMatchObject({
      suggested_color: 'azul',
      final_color: 'laranja',
      justification: 'Histórico prévio de aneurisma cerebral',
    });
  });
});
