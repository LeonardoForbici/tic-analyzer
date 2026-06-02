package com.acme.cliente.repository;

public interface ClienteRepository {
    @Procedure(procedureName = "PKG_CLIENTE.SALVAR")
    String salvar(String body);
}
