// Importar Express y otros módulos necesarios
const express = require('express');
const app = express();
const cors = require('cors');
const { google } = require('googleapis');
const bodyParser = require('body-parser');

// Inicializamos Express
app.use(bodyParser.json());
app.use(cors());
app.use(express.json());

// Crear una ruta de prueba para ver si el servidor funciona
app.get('/', (req, res) => {
    res.send('Servidor funcionando correctamente');
});

// Establecer el puerto donde el servidor escuchará
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});

// Nueva ruta para manejar las reservas
app.post('/reservar', async (req, res) => {
    const { docente, programa, materia, dia, horario, horas } = req.body;

    console.log('Datos recibidos:', { docente, programa, materia, dia, horario, horas });

    try {
        await guardarEnSheet({ docente, programa, materia, dia, horario, horas });
        await crearEventoEnCalendar({ docente, programa, materia, dia, horario, horas }); // Crear evento en Google Calendar
        res.status(200).json({ message: 'Reserva guardada correctamente en Google Sheets y Google Calendar' });
    } catch (error) {
        console.error('Error al guardar la reserva:', error);
        res.status(500).json({ message: 'Error al guardar la reserva' });
    }
});

// Configurar autenticación con Google (para Sheets y Calendar)
const auth = new google.auth.GoogleAuth({
    keyFile: 'reservaslaboratorio.json', // Asegúrate de que el archivo esté en la raíz del proyecto
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events' // Agregar el permiso para Google Calendar
    ],
});

// Inicializar el cliente de Google Sheets
const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });

const SPREADSHEET_ID = '11GFwIMADh2cDQhtYBQibNa_iUNy-DhvhfWFBFKiBzMU'; // Reemplaza con tu ID de la hoja
const CALENDAR_ID = 'c_e6dee9761b6ad32a6f2be320180ffd8e6d32d52acd75a2246e5c52a7f681347b@group.calendar.google.com'; // Reemplaza con el ID de tu calendario

// Función para guardar en Google Sheets
async function guardarEnSheet(datos) {
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'A1', // Ajusta esto para la ubicación de tus datos
        valueInputOption: 'RAW',
        resource: {
            values: [
                [datos.docente, datos.programa, datos.materia, datos.dia, datos.horario, datos.horas]
            ],
        },
    });
    console.log('Datos guardados en la hoja de cálculo:', response.data);
}

// Redondear hora
function redondearHora(horario) {
    const [horas, minutos] = horario.split(':').map(Number);
    const minutosRedondeados = Math.round(minutos / 15) * 15;

    // Ajustamos para redondear correctamente las horas y minutos
    const nuevasHoras = minutosRedondeados === 60 ? horas + 1 : horas;
    const nuevosMinutos = minutosRedondeados === 60 ? 0 : minutosRedondeados;

    // Retornamos la hora con minutos y segundos formateados
    return `${nuevasHoras.toString().padStart(2, '0')}:${nuevosMinutos.toString().padStart(2, '0')}:00`;
}

// Función para calcular la hora de finalización del evento
function calcularHoraFin(horarioInicio, horas) {
    const [horasInicio, minutosInicio] = horarioInicio.split(':').map(Number);
    const totalHoras = horasInicio + parseInt(horas, 10);

    // Retornamos la hora final en formato `HH:mm:ss`
    return `${totalHoras.toString().padStart(2, '0')}:${minutosInicio.toString().padStart(2, '0')}:00`;
}


// Función para verificar la disponibilidad en Google Calendar
async function verificarDisponibilidadEnCalendar(dia, horario, horas) {
    const horarioRedondeado = redondearHora(horario);
    const horaFin = calcularHoraFin(horarioRedondeado, horas);

    try {
        const response = await calendar.events.list({
            calendarId: CALENDAR_ID, 
            timeMin: `${dia}T00:00:00-05:00`, // Inicio del día de la reserva
            timeMax: `${dia}T23:59:59-05:00`, // Fin del día de la reserva
            singleEvents: true, // Asegura que obtengamos todos los eventos como eventos únicos
            orderBy: 'startTime', // Ordenar por hora de inicio
        });

        const eventos = response.data.items;

        // Convertir a objetos de fecha para hacer la comparación
        const inicioReserva = new Date(`${dia}T${horarioRedondeado}-05:00`);
        const finReserva = new Date(`${dia}T${horaFin}-05:00`);

        // Verificar si hay algún evento que se solape con la reserva solicitada
        for (let evento of eventos) {
            const inicioEvento = new Date(evento.start.dateTime);
            const finEvento = new Date(evento.end.dateTime);

            // Verificar solapamiento
            if (
                (inicioReserva >= inicioEvento && inicioReserva < finEvento) || // Comienza dentro del evento
                (finReserva > inicioEvento && finReserva <= finEvento) || // Termina dentro del evento
                (inicioReserva <= inicioEvento && finReserva >= finEvento) // Cubre todo el evento
            ) {
                return false; // Hay un conflicto de horarios
            }
        }
        return true; // No hay conflictos
    } catch (error) {
        console.error('Error al verificar disponibilidad en Google Calendar:', error);
        throw new Error('Error verificando disponibilidad en Google Calendar');
    }
}

// Nueva ruta para manejar las reservas con validación de disponibilidad
app.post('/reservar', async (req, res) => {
    const { docente, programa, materia, dia, horario, horas } = req.body;

    console.log('Datos recibidos:', { docente, programa, materia, dia, horario, horas });

    try {
        // Verificamos disponibilidad en Google Calendar antes de proceder
        const disponible = await verificarDisponibilidadEnCalendar(dia, horario, horas);
        if (!disponible) {
            return res.status(400).json({ message: 'El horario ya está reservado, por favor elige otro.' });
        }

        // Si está disponible, guardamos en Sheets y Calendar
        await guardarEnSheet({ docente, programa, materia, dia, horario, horas });
        await crearEventoEnCalendar({ docente, programa, materia, dia, horario, horas });

        res.status(200).json({ message: 'Reserva guardada correctamente en Google Sheets y Google Calendar' });
    } catch (error) {
        console.error('Error al guardar la reserva:', error);
        res.status(500).json({ message: 'Error al guardar la reserva' });
    }
});




// Función para crear eventos en Google Calendar
async function crearEventoEnCalendar(datos) {
    const horarioRedondeado = redondearHora(datos.horario);

    const event = {
        summary: `Reserva: ${datos.docente} - ${datos.materia}`,
        description: `Programa: ${datos.programa}\nMateria: ${datos.materia}\nDocente: ${datos.docente}`,
        start: {
            dateTime: `${datos.dia}T${horarioRedondeado}`,
            timeZone: 'America/Bogota',
        },
        end: {
            dateTime: `${datos.dia}T${calcularHoraFin(horarioRedondeado, datos.horas)}`,
            timeZone: 'America/Bogota',
        },
    };

    try {
        // Aquí se usa el ID del calendario que definiste en la constante `CALENDAR_ID`
        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID, // Usa el ID del calendario específico
            resource: event,
        });
        console.log('Evento creado: %s', response.data.htmlLink);
    } catch (error) {
        console.error('Error al crear evento en Google Calendar:', JSON.stringify(error.response.data, null, 2));
        throw new Error('Error creando el evento en Google Calendar');
    }
}






