package com.acme.pedido.repository;

import com.acme.pedido.model.Pedido;

public interface PedidoRepository extends JpaRepository<Pedido, Long> {

    @Query(value = "SELECT * FROM \"pedido_item\" pi WHERE pi.pedido_id = ?1", nativeQuery = true)
    Object[] itens(Long pedidoId);

    @Query(value = "UPDATE pedido SET status = :status, total = :total WHERE id = :id", nativeQuery = true)
    int atualizar(String status, Double total, Long id);

    Long persistir(String body);
}
