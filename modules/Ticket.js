import moment from 'moment'
import _ from 'lodash'
import xss from 'xss'
import React, {Component} from 'react'
import PropTypes from 'prop-types'
import {FormGroup, ControlLabel, Alert, Button, Tooltip, OverlayTrigger} from 'react-bootstrap'
import {auth, cloud, db} from '../lib/leancloud'

import {UserLabel, uploadFiles, getCategoryPathName, getCategoriesTree} from './common'
import css from './Ticket.css'
import csCss from './CustomerServiceTickets.css'
import DocumentTitle from 'react-document-title'

import {TICKET_STATUS, isTicketOpen, getTinyCategoryInfo} from '../lib/common'
import Evaluation from './Evaluation'
import TicketMetadata from './TicketMetadata'
import TicketReply from './TicketReply'
import TicketStatusLabel from './TicketStatusLabel'
import translate from './i18n/translate'
import Tag from './Tag'
import {WeekendWarning} from './components/WeekendWarning'

// get a copy of default whiteList
const whiteList = xss.getDefaultWhiteList()

// allow class attribute for span and code tag
whiteList.span.push('class')
whiteList.code.push('class')

// specified you custom whiteList
const myxss = new xss.FilterXSS({
  whiteList,
  css: false,
})

class Ticket extends Component {

  constructor(props) {
    super(props)
    this.state = {
      categoriesTree: [],
      ticket: null,
      replies: [],
      opsLogs: [],
      watch: null,
    }
  }

  componentDidMount() {
    this.getTicketQuery(parseInt(this.props.params.nid)).first()
    .then(ticket => {
      if (!ticket) {
        return this.props.router.replace({
          pathname: '/error',
          state: { code: 'Unauthorized' }
        })
      }

      return Promise.all([
        cloud.run('getPrivateTags', {ticketId: ticket.id}),
        getCategoriesTree(false),
        this.getReplyQuery(ticket).find(),
        db.class('Tag').where('ticket', '==', ticket).find(),
        this.getOpsLogQuery(ticket).find(),
        db.class('Watch')
          .where('ticket', '==', ticket)
          .where('user', '==', auth.currentUser())
          .first(),
      ])
      .then(([privateTags, categoriesTree, replies, tags, opsLogs, watch]) => {
        if (privateTags) {
          ticket.set('privateTags', privateTags.privateTags)
        }
        this.setState({
          categoriesTree,
          ticket,
          replies,
          tags,
          opsLogs,
          watch,
        })
        cloud.run('exploreTicket', {ticketId: ticket.id})
        return
      })
    })
    .catch(this.context.addNotification)
  }

  componentWillUnmount() {
    if (this.replyLiveQuery) {
      Promise.all([
        this.ticketLiveQuery.unsubscribe(),
        this.replyLiveQuery.unsubscribe(),
        this.opsLogLiveQuery.unsubscribe()
      ])
      .catch(this.context.addNotification)
    }
  }

  getTicketQuery(nid) {
    const query = db.class('Ticket')
    .where('nid', '==', nid)
    .include('author')
    .include('organization')
    .include('assignee')
    .include('files')
    .limit(1)
    query.subscribe().then(liveQuery => {
      this.ticketLiveQuery = liveQuery
      return this.ticketLiveQuery.on('update', ticket => {
        if (ticket.updatedAt.getTime() != this.state.ticket.updatedAt.getTime()) {
          return Promise.all([
            ticket.get({include: ['author', 'organization', 'assignee', 'files']}),
            cloud.run('getPrivateTags', {ticketId: ticket.id}),
          ])
          .then(([ticket, privateTags]) => {
            if (privateTags) {
              ticket.data.privateTags = privateTags.privateTags
            }
            this.setState({ticket})
            cloud.run('exploreTicket', {ticketId: ticket.id})
            return
          })
          .catch(this.context.addNotification)
        }
      })
    })
    .catch(this.context.addNotification)
    return query
  }

  getReplyQuery(ticket) {
    const replyQuery = db.class('Reply')
    .where('ticket', '==', ticket)
    .include('author')
    .include('files')
    .orderBy('createdAt')
    .limit(500)
    replyQuery.subscribe().then(liveQuery => {
      this.replyLiveQuery = liveQuery
      return this.replyLiveQuery.on('create', reply => {
        return reply.get({include: ['author', 'files']})
        .then((reply) => {
          const replies = this.state.replies
          replies.push(reply)
          this.setState({replies})
          return
        }).catch(this.context.addNotification)
      })
    })
    .catch(this.context.addNotification)
    return replyQuery
  }

  getOpsLogQuery(ticket) {
    const opsLogQuery = db.class('OpsLog')
    .where('ticket', '==', ticket)
    .orderBy('createdAt')
    opsLogQuery.subscribe()
    .then(liveQuery => {
      this.opsLogLiveQuery = liveQuery
      return this.opsLogLiveQuery.on('create', opsLog => {
        return opsLog.get()
        .then((opsLog) => {
          const opsLogs = this.state.opsLogs
          opsLogs.push(opsLog)
          this.setState({opsLogs})
          return
        }).catch(this.context.addNotification)
      })
    })
    .catch(this.context.addNotification)
    return opsLogQuery
  }

  commitReply(reply, files) {
    return uploadFiles(files)
    .then((files) => {
      if (reply.trim() === '' && files.length == 0) {
        return
      }
      return db.class('Reply').add({
        ticket: this.state.ticket,
        content: reply,
        files,
      })
    })
  }

  commitReplySoon() {
    return this.operateTicket('replySoon')
  }

  operateTicket(action) {
    const ticket = this.state.ticket
    return cloud.run('operateTicket', {ticketId: ticket.id, action})
    .then(() => {
      return ticket.get({include: ['author', 'organization', 'assignee', 'files']})
    })
    .then((ticket) => {
      this.setState({ticket})
      return
    })
    .catch(this.context.addNotification)
  }

  updateTicketCategory(category) {
    const ticket = this.state.ticket
    return ticket.update({category: getTinyCategoryInfo(category)})
    .then(() => {
      ticket.data.category = category
      this.setState({ticket})
      return
    })
  }

  updateTicketAssignee(assignee) {
    const ticket = this.state.ticket
    return ticket.update({assignee})
    .then(() => {
      ticket.data.assignee = assignee
      return
    })
  }

  saveTag(key, value, isPrivate) {
    const ticket = this.state.ticket
    let tags = ticket.get(isPrivate ? 'privateTags' : 'tags')
    if (!tags) {
      tags = []
    }
    const tag = _.find(tags, {key})
    if (!tag) {
      if (value == '') {
        return
      }
      tags.push({key, value})
    } else {
      if (value == '') {
        tags = _.reject(tags, {key})
      } else {
        tag.value = value
      }
    }
    return ticket.update({[isPrivate ? 'privateTags' : 'tags']: tags})
    .then(() => {
      this.setState({ticket})
      return
    })
  }

  saveEvaluation(evaluation) {
    const ticket = this.state.ticket
    ticket.data.evaluation = evaluation
    return ticket.update({evaluation})
    .then(() => {
      this.setState({ticket})
      return
    })
  }

  handleAddWatch() {
    return db.class('Watch').add({
      ticket: this.state.ticket,
      user: auth.currentUser(),
      ACL: {
        [auth.currentUser().id]: {write: true, read: true},
      }
    })
    .then(watch => {
      this.setState({watch})
      return
    })
    .catch(this.context.addNotification)
  }

  handleRemoveWatch() {
    return this.state.watch.delete()
    .then(() => {
      this.setState({watch: undefined})
      return
    })
    .catch(this.context.addNotification)
  }

  contentView(content) {
    return (
      <div dangerouslySetInnerHTML={{__html: myxss.process(content)}} />
    )
  }

  getTime(avObj) {
    if (new Date() - avObj.get('createdAt') > 86400000) {
      return <a href={'#' + avObj.id} className="timestamp" title={moment(avObj.get('createdAt')).format()}>{moment(avObj.get('createdAt')).calendar()}</a>
    } else {
      return <a href={'#' + avObj.id} className="timestamp" title={moment(avObj.get('createdAt')).format()}>{moment(avObj.get('createdAt')).fromNow()}</a>
    }
  }

  ticketTimeline(t, avObj) {
    if (avObj.className === 'OpsLog') {
      switch (avObj.get('action')) {
      case 'selectAssignee':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap'><span className='glyphicon glyphicon-transfer'></span></span>
            </div>
            <div className='ticket-status-right'>
              {t('system')} {t('assignedTicketTo')} <UserLabel user={avObj.get('data').assignee} /> ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'changeCategory':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap'><span className='glyphicon glyphicon-transfer'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('changedTicketCategoryTo')} <span className={csCss.category + ' ' + css.category}>{getCategoryPathName(avObj.get('data').category, this.state.categoriesTree, t)}</span> ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'changeAssignee':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap'><span className='glyphicon glyphicon-transfer'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('changedTicketAssigneeTo')}  <UserLabel user={avObj.get('data').assignee} /> ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'replyWithNoContent':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap'><span className='glyphicon glyphicon-comment'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('thoughtNoNeedToReply')} ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'replySoon':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap awaiting'><span className='glyphicon glyphicon-hourglass'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('thoughtNeedTime')} ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'resolve':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap resolved'><span className='glyphicon glyphicon-ok-circle'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('thoughtResolved')} ({this.getTime(avObj)})
            </div>
          </div>
        )
      case 'reject':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap closed'><span className='glyphicon glyphicon-ban-circle'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('closedTicket')} ({this.getTime(avObj)}) 
            </div>
          </div>
        )
      case 'reopen':
        return (
          <div className='ticket-status' id={avObj.id} key={avObj.id}>
            <div className='ticket-status-left'>
              <span className='icon-wrap reopened'><span className='glyphicon glyphicon-record'></span></span>
            </div>
            <div className='ticket-status-right'>
              <UserLabel user={avObj.get('data').operator} /> {t('reopenedTicket')} ({this.getTime(avObj)}) 
            </div>
          </div>
        )
      }
    } else {
      let panelFooter = <div></div>
      let imgBody = <div></div>
      const files = avObj.get('files')
      if (files && files.length !== 0) {
        const imgFiles = []
        const otherFiles = []
        files.forEach(f => {
          const mimeType = f.get('mime_type')
          if (['image/png', 'image/jpeg', 'image/gif'].indexOf(mimeType) != -1) {
            imgFiles.push(f)
          } else {
            otherFiles.push(f)
          }
        })

        if (imgFiles.length > 0) {
          imgBody = imgFiles.map(f => {
            return <a href={f.data.url} target='_blank' key={f.id}><img src={f.data.url} alt={f.get('name')} /></a>
          })
        }

        if (otherFiles.length > 0) {
          const fileLinks = otherFiles.map(f => {
            return <span key={f.id}><a href={f.data.url + '?attname=' + encodeURIComponent(f.get('name'))} target='_blank'><span className="glyphicon glyphicon-paperclip"></span> {f.get('name')}</a> </span>
          })
          panelFooter = <div className="panel-footer">{fileLinks}</div>
        }
      }
      const panelClass = `panel ${css.item} ${(avObj.get('isCustomerService') ? css.panelModerator : 'panel-common')}`
      const userLabel = avObj.get('isCustomerService') ? <span><UserLabel user={avObj.get('author')} /><i className={css.badge}>{t('staff')}</i></span> : <UserLabel user={avObj.get('author')} />
      return (
        <div id={avObj.id} key={avObj.id} className={panelClass}>
          <div className={ 'panel-heading ' + css.heading }>
          {userLabel} {t('submittedAt')} {this.getTime(avObj)}
          </div>
          <div className={ 'panel-body ' + css.content }>
            {this.contentView(avObj.get('content_HTML'))}
            {imgBody}
          </div>
          {panelFooter}
        </div>
      )
    }
  }

  render() {
    const {t} = this.props
    const ticket = this.state.ticket
    if (ticket === null) {
      return (
      <div>{t('loading')}……</div>
      )
    }

    // 如果是客服自己提交工单，则当前客服在该工单中认为是用户，
    // 这是为了方便工单作为内部工作协调使用。
    const isCustomerService = this.props.isCustomerService && ticket.get('author').id != this.props.currentUser.id
    const timeline = _.chain(this.state.replies)
      .concat(this.state.opsLogs)
      .sortBy((data) => {
        return data.get('createdAt')
      }).map(this.ticketTimeline.bind(this, t))
      .value()
    let optionButtons = <div></div>
    const ticketStatus = ticket.get('status')
    if (isTicketOpen(ticket)) {
      optionButtons = (
        <FormGroup>
          <ControlLabel>{t('ticketOperation')}</ControlLabel>
          <FormGroup>
            <button type="button" className='btn btn-default' onClick={() => this.operateTicket('resolve')}>{t('resolved')}</button>
            {' '}
            <button type="button" className='btn btn-default' onClick={() => this.operateTicket('reject')}>{t('close')}</button>
          </FormGroup>
        </FormGroup>
      )
    } else if (ticketStatus === TICKET_STATUS.PRE_FULFILLED && !isCustomerService) {
      optionButtons = (
        <Alert bsStyle="warning">
          <ControlLabel>{t('confirmResolved')}</ControlLabel>
          <Button bsStyle="primary" onClick={() => this.operateTicket('resolve')}>{t('resolutionConfirmed')}</Button>
          {' '}
          <Button onClick={() => this.operateTicket('reopen')}>{t('unresolved')}</Button>
        </Alert>
      )
    } else if (isCustomerService) {
      optionButtons = (
        <FormGroup>
          <ControlLabel>{t('ticketOperation')}</ControlLabel>
          <FormGroup>
            <button type="button" className='btn btn-default' onClick={() => this.operateTicket('reopen')}>{t('reopen')}</button>
          </FormGroup>
        </FormGroup>
      )
    }

    return (
      <div>
        <div className="row">
          <div className="col-sm-12">
            {!isCustomerService && <WeekendWarning />}
            <DocumentTitle title={ticket.get('title') + ' - LeanTicket' || 'LeanTicket'} />
            <h1>{ticket.get('title')}</h1>
            <div className={css.meta}>
              <span className={csCss.nid}>#{ticket.get('nid')}</span>
              <TicketStatusLabel status={ticket.get('status')} />
              {' '}
              <span>
                <UserLabel user={ticket.get('author')} displayTags={isCustomerService} /> {t('createdAt')} <span title={moment(ticket.get('createdAt')).format()}>{moment(ticket.get('createdAt')).fromNow()}</span>
                {moment(ticket.get('createdAt')).fromNow() === moment(ticket.get('updatedAt')).fromNow() ||
                  <span>, {t('updatedAt')} <span title={moment(ticket.get('updatedAt')).format()}>{moment(ticket.get('updatedAt')).fromNow()}</span></span>
                }
              </span>
              {' '}
              {this.props.isCustomerService ? this.state.watch ?
                <OverlayTrigger placement="right" overlay={
                  <Tooltip id="tooltip">{t('clickToUnsubscribe')}</Tooltip>
                }>
                  <Button bsStyle='link' active onClick={this.handleRemoveWatch.bind(this)}><span className='glyphicon glyphicon-eye-open' aria-hidden='true'></span></Button>
                </OverlayTrigger>
                :
                <OverlayTrigger placement="right" overlay={
                  <Tooltip id="tooltip">{t('clickToSubscribe')}</Tooltip>
                }>
                  <Button bsStyle='link' onClick={this.handleAddWatch.bind(this)}><span className='glyphicon glyphicon-eye-close' aria-hidden='true'></span></Button>
                </OverlayTrigger>
                : <div></div>
              }
            </div>
            <hr />
          </div>
        </div>

        <div className="row">
          <div className="col-sm-8">
            <div className="tickets">
              {this.ticketTimeline(t, ticket)}
              <div>{timeline}</div>
            </div>

            {isTicketOpen(ticket) &&
              <div>
                <hr />

                <TicketReply
                  ticket={ticket}
                  commitReply={this.commitReply.bind(this)}
                  commitReplySoon={this.commitReplySoon.bind(this)}
                  operateTicket={this.operateTicket.bind(this)}
                  isCustomerService={isCustomerService}
                />
              </div>
            }
            {!isTicketOpen(ticket) &&
              <div>
                <hr />

                <Evaluation
                  saveEvaluation={this.saveEvaluation.bind(this)}
                  ticket={ticket}
                  isCustomerService={isCustomerService}
                />
              </div>
            }
          </div>

          <div className={'col-sm-4 ' + css.sidebar}>
            {this.state.tags.map((tag) => {
              return <Tag key={tag.id} tag={tag} ticket={ticket} isCustomerService={isCustomerService} />
            })}

            <TicketMetadata ticket={ticket}
              isCustomerService={isCustomerService}
              categoriesTree={this.state.categoriesTree}
              updateTicketAssignee={this.updateTicketAssignee.bind(this)}
              updateTicketCategory={this.updateTicketCategory.bind(this)}
              saveTag={this.saveTag.bind(this)}
            />

            {optionButtons}
          </div>
        </div>
      </div>
    )
  }

}

Ticket.propTypes = {
  router: PropTypes.object,
  currentUser: PropTypes.object,
  isCustomerService: PropTypes.bool,
  params: PropTypes.object,
  t: PropTypes.func
}

Ticket.contextTypes = {
  addNotification: PropTypes.func.isRequired,
}

export default translate(Ticket)
