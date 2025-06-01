int: NUM_DIAS = 5;
int: NUM_BLOQUES = 8;

set of int: DIAS = 1..NUM_DIAS;
set of int: BLOQUES = 1..NUM_BLOQUES;

array[int, int] of int: docente_asignado;
array[int, int] of int: horas_curso_grado;
array[int, int, int] of bool: disponible;

set of int: CURSOS = index_set_1of2(docente_asignado);
set of int: GRADOS = index_set_2of2(docente_asignado);
set of int: DOCENTES = index_set_1of3(disponible);

int: NUM_CURSOS = card(CURSOS);
int: NUM_GRADOS = card(GRADOS);
int: NUM_DOCENTES = card(DOCENTES);

array[DIAS, BLOQUES, GRADOS] of var 0..NUM_CURSOS: horario;

array[CURSOS, GRADOS] of var 0..8: horas_asignadas;
constraint forall(c in CURSOS, g in GRADOS)(
  horas_asignadas[c,g] = sum(d in DIAS, b in BLOQUES)(bool2int(horario[d,b,g] = c))
);

array[CURSOS, GRADOS] of var int: faltantes;
constraint forall(c in CURSOS, g in GRADOS)(
  faltantes[c,g] = horas_curso_grado[c,g] - horas_asignadas[c,g]
);

% ➤ Aplicar restricciones solo si la disponibilidad del docente no es completa
constraint forall(d in DIAS, b in BLOQUES, g in GRADOS)(
  let {
    var int: c = horario[d,b,g],
    int: docente = docente_asignado[c,g]
  } in
    c = 0 \/ disponible[docente, d, b]
);

var int: ventanas = sum(g in GRADOS, d in DIAS)(
  sum(b in 2..NUM_BLOQUES - 1)(
    bool2int(
      horario[d,b,g] = 0 /\
      horario[d,b-1,g] > 0 /\
      horario[d,b+1,g] > 0
    )
  )
);

var int: total_faltantes = sum(c in CURSOS, g in GRADOS)(faltantes[c,g]);

solve minimize total_faltantes * 100 + ventanas;

output [
  "{\"horario\": ", show(horario),
  ", \"ventanas\": ", show(ventanas),
  ", \"faltantes\": ", show(total_faltantes), "}"
];
