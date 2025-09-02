% --- Declaración de parámetros generales ---
int: NUM_DIAS;
int: NUM_BLOQUES;
int: NUM_CLASES;         % total de asignaciones curso-grado-docente
int: NUM_DOCENTES;
int: NUM_GRADOS;

set of int: DIAS = 1..NUM_DIAS;
set of int: BLOQUES = 1..NUM_BLOQUES;
set of int: CLASES = 1..NUM_CLASES;
set of int: DOCENTES = 1..NUM_DOCENTES;
set of int: GRADOS = 1..NUM_GRADOS;

% Datos de entrada para cada clase
array[CLASES] of int: curso_id;
array[CLASES] of int: grado_id;
array[CLASES] of int: docente_id;
array[CLASES] of int: horas;

% Disponibilidad de los docentes: docente x dia x bloque
array[DOCENTES, DIAS, BLOQUES] of bool: disponibilidad;

% --- Variables de decisión ---
% Para cada clase, asignar el día y bloque inicial de cada hora que le corresponde
array[CLASES, 1..8] of var 0..NUM_DIAS * NUM_BLOQUES: horario; % 0 significa "no asignado"

% --- Restricciones ---
constraint
    forall(c in CLASES) (
        let {
            int: h = horas[c]
        } in
            forall(i in 1..h) (
                horario[c, i] > 0 /\
                let {
                    var int: dia = (horario[c, i] - 1) div NUM_BLOQUES + 1,
                    var int: bloque = (horario[c, i] - 1) mod NUM_BLOQUES + 1
                } in
                    disponibilidad[docente_id[c], dia, bloque]
            )
    )
;

% No solapar bloques para un mismo grado
constraint
    forall(g in GRADOS, d in DIAS, b in BLOQUES) (
        sum([bool2int(horario[c, i] = (d-1)*NUM_BLOQUES + b)
             | c in CLASES where grado_id[c] = g,
               i in 1..horas[c]]) <= 1
    )
;

% No solapar bloques para un mismo docente
constraint
    forall(p in DOCENTES, d in DIAS, b in BLOQUES) (
        sum([bool2int(horario[c, i] = (d-1)*NUM_BLOQUES + b)
             | c in CLASES where docente_id[c] = p,
               i in 1..horas[c]]) <= 1
    )
;

% --- Objetivo: maximizar bloques asignados ---
var int: bloques_totales := sum(c in CLASES, i in 1..horas[c]) (bool2int(horario[c, i] > 0));
solve maximize bloques_totales;
