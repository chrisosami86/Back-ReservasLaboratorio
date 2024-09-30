const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

// Cargar variables de entorno
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Leer variables del archivo .env
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const sheetId = process.env.GOOGLE_SHEET_ID;
const googleCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Configuración de las credenciales del cliente de Google
const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});

// Inicializamos el cliente de Google Calendar y Google Sheets
const calendar = google.calendar({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

// Intervals que debes validar en el calendario
const timeIntervals = {
    1: { start: '07:00', end: '10:00' },
    2: { start: '10:00', end: '13:00' },
    3: { start: '14:00', end: '17:00' },
    4: { start: '18:30', end: '21:30' },
};

// Convertir el objeto a un arreglo para facilitar la iteración
const timeIntervalsArray = Object.keys(timeIntervals).map(key => ({
    id: Number(key),
    ...timeIntervals[key],
}));

// Función para convertir intervalos a un formato compatible con Calendar
function convertToISODate(date, time) {
    return new Date(`${date}T${time}:00`).toISOString();
}

app.post('/validate-intervals', async (req, res) => {
    try {
        const { selectedDate } = req.body;

        const startOfDay = new Date(`${selectedDate}T00:00:00Z`).toISOString();
        const endOfDay = new Date(`${selectedDate}T23:59:59Z`).toISOString();

        // Buscar eventos del día en el calendario
        const events = await calendar.events.list({
            calendarId,
            timeMin: startOfDay,
            timeMax: endOfDay,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const occupiedIntervals = [];

        // Revisar los eventos para encontrar intervalos ocupados
        events.data.items.forEach((event) => {
            const eventStart = new Date(event.start.dateTime).toISOString().slice(11, 16);
            const eventEnd = new Date(event.end.dateTime).toISOString().slice(11, 16);

            // Verificar superposición con cada intervalo
            Object.values(timeIntervals).forEach((interval) => {  // Uso de Object.values()
                if (
                    (eventStart < interval.end && eventEnd > interval.start)
                ) {
                    occupiedIntervals.push(interval);
                }
            });
        });

        // Eliminar duplicados en occupiedIntervals
        const uniqueOccupiedIntervals = [...new Set(occupiedIntervals.map(JSON.stringify))].map(JSON.parse);

        // Filtrar los intervalos disponibles y añadir ID
        const availableIntervals = Object.entries(timeIntervals).filter(([id, interval]) => {
            return !uniqueOccupiedIntervals.some(occupied => 
                occupied.start === interval.start && occupied.end === interval.end
            );
        }).map(([id, interval]) => ({ id, ...interval })); // Añadir ID a cada intervalo

        res.status(200).json({ availableIntervals });
    } catch (error) {
        console.error('Error al validar intervalos:', error);
        res.status(500).json({ error: 'Error al validar intervalos.' });
    }
});


// Endpoint para registrar un evento en el calendario y en la hoja de cálculo
app.post('/register-reservation', async (req, res) => {
    try {
        const { teacherName, subject, reservationDate, timeSlotId } = req.body;

        // Obtener el intervalo de tiempo basado en el ID
        const selectedInterval = timeIntervals[timeSlotId];

        if (!selectedInterval) {
            return res.status(400).json({ error: 'Intervalo de tiempo no válido.' });
        }

        // Crear el evento en Google Calendar
        const event = {
            summary: `${teacherName} - ${subject}`,
            start: {
                dateTime: convertToISODate(reservationDate, selectedInterval.start),
                timeZone: 'America/Bogota',
            },
            end: {
                dateTime: convertToISODate(reservationDate, selectedInterval.end),
                timeZone: 'America/Bogota',
            },
        };

        // Insertar el evento en Google Calendar
        await calendar.events.insert({
            calendarId,
            resource: event,
        });

        // Registrar los datos en Google Sheets
        const newRow = [
            new Date().toISOString(),
            teacherName,
            subject,
            reservationDate,
            `${selectedInterval.start} - ${selectedInterval.end}`,
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'A:E',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] },
        });

        res.status(200).json({ message: 'Reserva registrada exitosamente en el calendario y la hoja de cálculo.' });
    } catch (error) {
        console.error('Error al registrar reserva:', error);
        res.status(500).json({ error: 'Error al registrar la reserva.' });
    }
});

// Inicializar el servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
